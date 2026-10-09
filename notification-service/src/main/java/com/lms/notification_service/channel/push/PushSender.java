package com.lms.notification_service.channel.push;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.config.PushProperties;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.DeviceToken;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import com.lms.notification_service.repository.DeviceTokenRepository;
import lombok.extern.slf4j.Slf4j;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Web/mobile push through FCM, one request per device. Delivered to at least one device = SENT; a
 * token FCM no longer recognises is deactivated so it is not tried again; no devices = SKIPPED.
 * Registered by PushConfig only when lms.notification.push.enabled=true.
 */
@Slf4j
public class PushSender implements ChannelSender {

    static final String PROVIDER = "fcm";

    private final FcmClient fcm;
    private final DeviceTokenRepository devices;
    private final PushProperties props;

    public PushSender(FcmClient fcm, DeviceTokenRepository devices, PushProperties props) {
        this.fcm = fcm;
        this.devices = devices;
        this.props = props;
    }

    @Override
    public ChannelType channel() {
        return ChannelType.PUSH;
    }

    @Override
    public String resolveTarget(NotificationTarget target) {
        List<String> explicit = target == null ? null : target.deviceTokens();
        return explicit != null && !explicit.isEmpty() ? explicit.size() + " device(s)" : "registered devices";
    }

    @Override
    public SendResult send(Notification notification, NotificationTarget target, RenderedContent content) {
        List<String> tokens = target != null && target.deviceTokens() != null && !target.deviceTokens().isEmpty()
                ? target.deviceTokens()
                : devices.findByTenantIdAndUserIdAndActiveIsTrue(notification.getTenantId(), notification.getUserId())
                        .stream().map(DeviceToken::getToken).toList();
        if (tokens.isEmpty()) return SendResult.skipped(PROVIDER, "user has no registered devices");

        Map<String, String> vars = notification.getVariables() == null ? Map.of() : notification.getVariables();
        String link = absoluteLink(vars.get("link"));
        Map<String, String> data = new LinkedHashMap<>();
        data.put("notificationId", notification.getNotificationId() == null ? "" : notification.getNotificationId());
        if (notification.getTemplateName() != null) data.put("template", notification.getTemplateName());
        if (link != null) data.put("link", link);

        int delivered = 0;
        boolean transientFailure = false;
        String firstMessage = null;
        String lastDetail = null;
        for (String token : tokens) {
            FcmClient.Result result = fcm.send(token, content.subject(), content.body(), data, httpsOnly(link));
            switch (result.outcome()) {
                case DELIVERED -> {
                    delivered++;
                    if (firstMessage == null) firstMessage = result.messageName();
                }
                case TOKEN_INVALID -> {
                    deactivate(token);
                    lastDetail = result.detail();
                }
                case TRANSIENT -> {
                    transientFailure = true;
                    lastDetail = result.detail();
                }
                case PERMANENT -> lastDetail = result.detail();
            }
        }
        if (delivered > 0) {
            return SendResult.sent(PROVIDER, delivered == tokens.size() ? firstMessage
                    : "%s (%d of %d devices)".formatted(firstMessage, delivered, tokens.size()));
        }
        return SendResult.failed(PROVIDER, transientFailure ? ErrorType.TRANSIENT : ErrorType.PERMANENT,
                "no device accepted the push: " + lastDetail);
    }

    private void deactivate(String token) {
        devices.findByToken(token).ifPresent(device -> {
            device.setActive(false);
            device.entityUpdate();
            devices.save(device);
            log.info("Deactivated a push token FCM no longer accepts (user {})", device.getUserId());
        });
    }

    private String absoluteLink(String link) {
        if (link == null || link.isBlank()) return null;
        if (link.startsWith("https://") || link.startsWith("http://")) return link;
        if (link.startsWith("/") && props.linkBase() != null) return props.linkBase().replaceAll("/$", "") + link;
        return null;
    }

    // FCM only accepts an https click-through link; plain-http dev links travel in `data` only
    private static String httpsOnly(String link) {
        return link != null && link.startsWith("https://") ? link : null;
    }
}
