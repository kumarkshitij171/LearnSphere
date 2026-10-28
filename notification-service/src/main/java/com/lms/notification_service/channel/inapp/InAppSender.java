package com.lms.notification_service.channel.inapp;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Locale;

/**
 * The in-app inbox. Nothing leaves the service: the row handed in is the inbox entry, and the
 * orchestrator saves it after send(), so delivering is filling it in. Always registered.
 */
@Component
public class InAppSender implements ChannelSender {

    static final String PROVIDER = "inbox";

    @Override
    public ChannelType channel() {
        return ChannelType.IN_APP;
    }

    @Override
    public String resolveTarget(NotificationTarget target) {
        return PROVIDER;
    }

    @Override
    public SendResult send(Notification notification, NotificationTarget target, RenderedContent content) {
        // an inbox is per user: a row without one could never be read
        if (!StringUtils.hasText(notification.getUserId())) {
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, "an in-app notification needs a userId");
        }
        notification.setTitle(content.subject());
        notification.setBody(content.body());
        notification.setLink(notification.getVariables() == null ? null : safeLink(notification.getVariables().get("link")));
        return SendResult.sent(PROVIDER, null);
    }

    // the app renders this as an href: an in-app path or http(s) only, never javascript: or //other-host
    static String safeLink(String link) {
        if (link == null || link.isBlank()) return null;
        String trimmed = link.trim();
        if (trimmed.startsWith("/")) return trimmed.startsWith("//") || trimmed.startsWith("/\\") ? null : trimmed;
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://") ? trimmed : null;
    }
}
