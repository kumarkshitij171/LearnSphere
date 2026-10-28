package com.lms.order_service.provider;

import tools.jackson.databind.JsonNode;

public record WebhookVerification(boolean valid, String providerEventId, String eventType, JsonNode payload,
                                  String rawBody, String failureReason) {

    public static WebhookVerification invalid(String reason) {
        return new WebhookVerification(false, null, null, null, null, reason);
    }

    public static WebhookVerification verified(String providerEventId, String eventType, JsonNode payload,
                                               String rawBody) {
        return new WebhookVerification(true, providerEventId, eventType, payload, rawBody, null);
    }
}
