package com.lms.order_service.models.event;

import com.lms.order_service.models.entity.Order;

import java.time.Instant;
import java.util.UUID;

/**
 * The `order.refunded` contract. fullRefund drives entitlement: the catalogue owner revokes access
 * only when the whole order has been refunded. Additive-only.
 */
public record OrderRefundedEvent(
        String eventId,
        String eventType,
        Instant occurredAt,
        String tenantId,
        String orderId,
        String userId,
        String courseId,
        long amountMinor,
        String currency,
        String provider,
        String refundId,
        long refundedAmountMinor,
        long totalRefundedMinor,
        boolean fullRefund) {

    public static final String TYPE = "order.refunded";

    public static OrderRefundedEvent of(Order order, String refundId, long refunded, long totalRefunded, Instant now) {
        return new OrderRefundedEvent(UUID.randomUUID().toString(), TYPE, now, order.getTenantId(),
                order.getId().toString(), order.getUserId(), order.getCourseId(), order.getAmountMinor(),
                order.getCurrency(), order.getProvider().name(), refundId, refunded, totalRefunded,
                totalRefunded >= order.getAmountMinor());
    }
}
