package com.lms.order_service.models.response;

import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentProviderType;

import java.time.Instant;
import java.util.UUID;

public record OrderResponse(
        UUID orderId,
        OrderStatus status,
        String courseId,
        String courseTitle,
        long amountMinor,
        String currency,
        PaymentProviderType provider,
        Instant expiresAt,
        Instant paidAt,
        Instant createdAt,
        long refundedMinor,
        // present only while the order is PENDING, so an abandoned checkout can be resumed
        CheckoutResponse checkout,
        // the buyer: their own on /orders, and who to contact for support on /admin/orders
        String userId,
        String userEmail) {
}
