package com.lms.order_service.provider;

import com.lms.order_service.models.domain.PaymentEventType;

import java.time.Instant;

/** What the rest of the service sees of a webhook. Nothing downstream knows which provider sent it. */
public record PaymentEvent(
        String providerEventId,
        PaymentEventType type,
        String providerOrderId,
        String providerPaymentId,
        long amountMinor,
        String currency,
        String method,
        String errorCode,
        String errorMessage,
        Instant occurredAt,
        // set only for REFUND_PROCESSED
        String providerRefundId) {
}
