package com.lms.notification_service.channel;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;

/** One implementation per delivery channel; adding SMS means adding a @Component and nothing else. */
public interface ChannelSender {

    ChannelType channel();

    SendResult send(Notification notification, NotificationTarget target, RenderedContent content);

    /** Address this channel delivers to, stored on the notification row for history/debugging. */
    String resolveTarget(NotificationTarget target);
}
