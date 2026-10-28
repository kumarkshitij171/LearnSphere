package com.lms.order_service.service;

import com.lms.order_service.models.domain.WebhookEventStatus;

/** httpStatus is what the provider sees: 200 for anything handled, so it stops retrying. */
public record WebhookOutcome(int httpStatus, WebhookEventStatus status, String detail) {

    public static WebhookOutcome handled(WebhookEventStatus status, String detail) {
        return new WebhookOutcome(200, status, detail);
    }

    public static WebhookOutcome duplicate() {
        return new WebhookOutcome(200, WebhookEventStatus.IGNORED, "already processed");
    }

    public static WebhookOutcome rejected(String detail) {
        return new WebhookOutcome(401, null, detail);
    }
}
