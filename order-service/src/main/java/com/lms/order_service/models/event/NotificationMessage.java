package com.lms.order_service.models.event;

import java.util.List;
import java.util.Map;

/**
 * The `notifications` topic contract, owned by notification-service (its SYSTEM_DESIGN.md §6.2).
 * Producers publish ready-made messages; notification-service renders and sends them.
 */
public record NotificationMessage(String notificationId, String tenantId, String userId, List<String> channels,
                                  String templateName, NotificationTarget target, Map<String, String> variables,
                                  int attempt) {
}
