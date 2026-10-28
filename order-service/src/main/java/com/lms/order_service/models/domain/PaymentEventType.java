package com.lms.order_service.models.domain;

public enum PaymentEventType {
    PAYMENT_CAPTURED,
    PAYMENT_FAILED,
    REFUND_PROCESSED,
    REFUND_FAILED
}
