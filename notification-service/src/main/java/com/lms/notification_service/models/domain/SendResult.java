package com.lms.notification_service.models.domain;

public record SendResult(boolean success, String provider, String providerMessageId, ErrorType errorType,
                         String errorMessage, boolean skipped) {

    public SendResult(boolean success, String provider, String providerMessageId, ErrorType errorType, String errorMessage) {
        this(success, provider, providerMessageId, errorType, errorMessage, false);
    }

    public static SendResult skipped(String provider, String reason) {
        return new SendResult(false, provider, null, null, reason, true);
    }

    public static SendResult sent(String provider, String providerMessageId) {
        return new SendResult(true, provider, providerMessageId, null, null);
    }

    public static SendResult failed(String provider, ErrorType errorType, String errorMessage) {
        return new SendResult(false, provider, null, errorType, errorMessage);
    }
}
