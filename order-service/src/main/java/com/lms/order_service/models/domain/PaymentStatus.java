package com.lms.order_service.models.domain;

// AUTHORIZED is unused while every provider auto-captures; kept so manual capture is config, not a migration
public enum PaymentStatus {
    INITIATED,
    AUTHORIZED,
    CAPTURED,
    FAILED,
    PARTIALLY_REFUNDED,
    REFUNDED
}
