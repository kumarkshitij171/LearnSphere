package com.lms.notification_service.models.event;

import com.lms.notification_service.models.domain.ChannelType;

import java.util.List;
import java.util.Map;

/**
 * Contract on the `notifications` topic. One message fans out to every channel it lists,
 * so adding SMS later is a producer-side change only.
 */
public record NotificationMessage(String notificationId, String tenantId, String userId, List<ChannelType> channels,
                                  String templateName, NotificationTarget target, Map<String, String> variables,
                                  int attempt) {
}
