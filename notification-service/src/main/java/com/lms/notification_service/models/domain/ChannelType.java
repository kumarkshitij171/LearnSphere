package com.lms.notification_service.models.domain;

public enum ChannelType {
    EMAIL,
    PUSH,
    SMS,
    WEBHOOK,
    // the inbox inside the app; needs no provider or browser permission
    IN_APP
}
