package com.lms.notification_service.service;

import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.kafka.NotificationProducer;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.DeadLetter;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.utils.CommonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

/** Inspect and replay dead letters once whatever broke them (a template, a credential) is fixed. */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeadLetterService {

    private final DeadLetterRepository deadLetters;
    private final NotificationRepository notifications;
    private final NotificationProducer producer;
    private final ObjectMapper objectMapper;

    public Page<DeadLetter> list(String tenantId, boolean includeReplayed, int page, int size) {
        PageRequest request = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return includeReplayed
                ? deadLetters.findByTenantIdOrderByCreatedAtDesc(tenantId, request)
                : deadLetters.findByTenantIdAndReplayedAtIsNullOrderByCreatedAtDesc(tenantId, request);
    }

    /**
     * Re-arms the one failed channel and republishes it through the normal pipeline, with an
     * attempt number past every previous one so the idempotency claim lets it through.
     */
    public NotificationMessage replay(String tenantId, String deadLetterId, String replayedBy) {
        DeadLetter letter = deadLetters.findByIdAndTenantId(deadLetterId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Dead letter " + deadLetterId + " not found"));
        if (letter.getReplayedAt() != null) {
            throw new ValidationException("Dead letter " + deadLetterId + " was already replayed", 409);
        }
        NotificationMessage original = objectMapper.readValue(letter.getPayload(), NotificationMessage.class);

        Notification row = notifications.findByTenantIdAndNotificationId(tenantId, letter.getNotificationId()).stream()
                .filter(n -> n.getChannel() == letter.getChannel())
                .findFirst()
                .orElse(null);
        int nextAttempt = Math.max(original.attempt(), row == null ? letter.getAttempts() : row.getAttempts()) + 1;
        if (row != null) {
            row.setStatus(NotificationStatus.PENDING);
            row.setErrorType(null);
            row.setErrorMessage(null);
            row.entityUpdate();
            notifications.save(row);
        }

        NotificationMessage replay = new NotificationMessage(original.notificationId(), original.tenantId(),
                original.userId(), List.of(letter.getChannel()), original.templateName(), original.target(),
                original.variables(), nextAttempt);
        producer.publish(replay);

        letter.setReplayedAt(CommonUtils.getCurrentTimeStamp());
        letter.setReplayedBy(replayedBy);
        letter.entityUpdate();
        deadLetters.save(letter);
        log.info("Replayed dead letter {} ({} on {}) as attempt {}", deadLetterId, letter.getNotificationId(),
                letter.getChannel(), nextAttempt);
        return replay;
    }
}
