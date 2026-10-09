package com.lms.notification_service.service;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.channel.ChannelSenderRegistry;
import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.DeadLetter;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final DeadLetterRepository deadLetterRepository;
    private final TemplateService templateService;
    private final IdempotencyService idempotencyService;
    private final ChannelSenderRegistry senderRegistry;
    private final NotificationMetrics metrics;
    private final RateLimitService rateLimits;
    private final ObjectMapper objectMapper;

    /**
     * Fans one inbound message out to each channel it requests; a channel failure never blocks the
     * others. Returns the channels that failed transiently, which the listener turns into a retry.
     * deliveryAttempt is 0 on the main topic and counts up through the retry topics.
     */
    public List<ChannelType> process(NotificationMessage message, int deliveryAttempt) {
        if (!StringUtils.hasText(message.tenantId())) {
            log.warn("Dropping notification {} with no tenantId", message.notificationId());
            return List.of();
        }
        if (message.channels() == null || message.channels().isEmpty()) {
            log.warn("Dropping notification {} with no channels", message.notificationId());
            return List.of();
        }
        List<ChannelType> transientChannels = new ArrayList<>();
        for (ChannelType channel : message.channels()) {
            try {
                if (dispatch(message, channel, message.attempt() + deliveryAttempt)) transientChannels.add(channel);
            } catch (Exception e) {
                log.error("Unexpected failure dispatching {} on {}", message.notificationId(), channel, e);
                transientChannels.add(channel);
            }
        }
        return transientChannels;
    }

    /** Called from the dead-letter topic: every channel still waiting on a retry is given up on. */
    public void exhausted(NotificationMessage message) {
        if (message.channels() == null) return;
        for (ChannelType channel : message.channels()) {
            Notification row = findRow(message.tenantId(), message.notificationId(), channel);
            if (row == null || row.getStatus() != NotificationStatus.RETRYING) continue;
            row.markFailed(row.getProvider(), ErrorType.EXHAUSTED_RETRIES, row.getErrorMessage());
            notificationRepository.save(row);
            deadLetter(message, row);
            log.error("Gave up on {} on {} after {} attempts: {}", message.notificationId(), channel,
                    row.getAttempts(), row.getErrorMessage());
        }
    }

    /** @return true when this channel failed transiently and should be retried */
    private boolean dispatch(NotificationMessage message, ChannelType channel, int attempt) {
        if (!idempotencyService.claim(message.tenantId(), message.notificationId(), channel, attempt)) {
            log.info("Skipping duplicate delivery of {} on {} (attempt {})", message.notificationId(), channel, attempt);
            return false;
        }

        ChannelSender sender = senderRegistry.get(channel).orElse(null);
        Notification notification = loadOrCreate(message, channel, sender);
        if (notification.isSettled()) {
            // a retry of a multi-channel message must not resend what already went out
            return false;
        }
        metrics.received(message.tenantId(), channel);

        if (sender == null) {
            log.warn("No sender registered for channel {}; notification {} not delivered", channel, message.notificationId());
            notification.markFailed(null, ErrorType.PERMANENT, "No sender registered for channel " + channel);
            notificationRepository.save(notification);
            deadLetter(message, notification);
            return false;
        }

        // over a quota: wait out the window on the retry topics rather than dropping the message
        String limited = rateLimits.check(message.tenantId(), channel, message.userId(), message.templateName());
        if (limited != null) {
            notification.markRetrying(sender.channel().name().toLowerCase(), limited);
            notificationRepository.save(notification);
            metrics.rateLimited(message.tenantId(), channel);
            log.warn("{} on {}: {}", message.notificationId(), channel, limited);
            return true;
        }

        notification.setAttempts(notification.getAttempts() + 1);
        long started = System.nanoTime();
        boolean retry = false;
        try {
            Template template = templateService.require(message.tenantId(), message.templateName(), channel);
            RenderedContent content = templateService.render(template, message.variables());
            SendResult result = sender.send(notification, message.target(), content);
            metrics.sendLatency(channel, System.nanoTime() - started);
            if (result.skipped()) {
                notification.markSkipped(result.provider(), result.errorMessage());
                log.info("Skipped {} on {}: {}", message.notificationId(), channel, result.errorMessage());
            } else if (result.success()) {
                notification.markSent(result);
                metrics.sent(message.tenantId(), channel);
                log.info("Sent {} on {} via {}", message.notificationId(), channel, result.provider());
            } else if (result.errorType() == ErrorType.TRANSIENT) {
                notification.markRetrying(result.provider(), result.errorMessage());
                metrics.retried(message.tenantId(), channel);
                retry = true;
                log.warn("Transient failure for {} on {}: {}", message.notificationId(), channel, result.errorMessage());
            } else {
                notification.markFailed(result.provider(), result.errorType(), result.errorMessage());
                log.warn("Failed {} on {}: [{}] {}", message.notificationId(), channel, result.errorType(), result.errorMessage());
            }
        } catch (ResourceNotFoundException | ValidationException e) {
            // template missing or unrenderable: retrying cannot help
            notification.markFailed(null, ErrorType.PERMANENT, e.getErrorMessage());
            log.warn("Permanent failure for {} on {}: {}", message.notificationId(), channel, e.getErrorMessage());
        } catch (Exception e) {
            notification.markRetrying(null, e.getMessage());
            retry = true;
            log.error("Transient failure for {} on {}", message.notificationId(), channel, e);
        }
        notificationRepository.save(notification);
        if (notification.getStatus() == NotificationStatus.FAILED) deadLetter(message, notification);
        return retry;
    }

    private void deadLetter(NotificationMessage message, Notification row) {
        DeadLetter letter = new DeadLetter();
        letter.setTenantId(message.tenantId());
        letter.setNotificationId(message.notificationId());
        letter.setUserId(message.userId());
        letter.setChannel(row.getChannel());
        letter.setTemplateName(message.templateName());
        letter.setErrorType(row.getErrorType());
        letter.setErrorMessage(row.getErrorMessage());
        letter.setAttempts(row.getAttempts());
        letter.setPayload(objectMapper.writeValueAsString(message));
        letter.entityCreate();
        deadLetterRepository.save(letter);
        metrics.failed(message.tenantId(), row.getChannel(), row.getErrorType());
    }

    private Notification findRow(String tenantId, String notificationId, ChannelType channel) {
        return notificationRepository.findByTenantIdAndNotificationId(tenantId, notificationId).stream()
                .filter(existing -> existing.getChannel() == channel)
                .findFirst()
                .orElse(null);
    }

    private Notification loadOrCreate(NotificationMessage message, ChannelType channel, ChannelSender sender) {
        Notification existing = findRow(message.tenantId(), message.notificationId(), channel);
        if (existing != null) return existing;
        Notification created = new Notification();
        created.setNotificationId(message.notificationId());
        created.setTenantId(message.tenantId());
        created.setUserId(message.userId());
        created.setChannel(channel);
        created.setTemplateName(message.templateName());
        created.setVariables(message.variables());
        created.setTarget(sender == null ? null : sender.resolveTarget(message.target()));
        created.entityCreate();
        return created;
    }

    public List<Notification> history(String tenantId, String notificationId) {
        return notificationRepository.findByTenantIdAndNotificationId(tenantId, notificationId);
    }

    public List<Notification> historyForUser(String tenantId, String userId) {
        return notificationRepository.findByTenantIdAndUserId(tenantId, userId);
    }
}
