package com.lms.notification_service.models.event;

import java.util.List;

/** Where a notification lands, per channel. Only the fields for the requested channels need a value. */
public record NotificationTarget(String email, String phone, List<String> deviceTokens) {
}
