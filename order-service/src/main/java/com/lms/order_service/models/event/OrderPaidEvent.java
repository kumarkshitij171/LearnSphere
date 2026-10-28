package com.lms.order_service.models.event;

import com.lms.order_service.models.entity.Order;

import java.time.Instant;
import java.util.UUID;

/** The `order.paid` contract the catalogue owner codes against. Additive-only. */
public record OrderPaidEvent(
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
        String providerPaymentId,
        Instant paidAt) {

    public static final String TYPE = "order.paid";

    public static OrderPaidEvent of(Order order, String providerPaymentId, Instant now) {
        return new OrderPaidEvent(UUID.randomUUID().toString(), TYPE, now, order.getTenantId(),
                order.getId().toString(), order.getUserId(), order.getCourseId(), order.getAmountMinor(),
                order.getCurrency(), order.getProvider().name(), providerPaymentId, order.getPaidAt());
    }
}
