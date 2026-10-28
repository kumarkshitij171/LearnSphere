package com.lms.notification_service.models.domain;

public enum NotificationStatus {
    PENDING,
    SENT,
    FAILED,
    RETRYING,
    // nothing to deliver to (e.g. push for a user with no registered devices): not a failure
    SKIPPED
}
