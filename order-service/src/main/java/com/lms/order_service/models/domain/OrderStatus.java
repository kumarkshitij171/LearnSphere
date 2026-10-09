package com.lms.order_service.models.domain;

public enum OrderStatus {
    CREATED,
    PENDING,
    PAID,
    FAILED,
    EXPIRED,
    CANCELLED,
    REFUND_PENDING,
    PARTIALLY_REFUNDED,
    REFUNDED
}
