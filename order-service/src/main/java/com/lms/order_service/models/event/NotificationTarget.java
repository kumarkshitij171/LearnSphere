package com.lms.order_service.models.event;

import java.util.List;

/** Mirrors notification-service's NotificationTarget. */
public record NotificationTarget(String email, String phone, List<String> deviceTokens) {
}
