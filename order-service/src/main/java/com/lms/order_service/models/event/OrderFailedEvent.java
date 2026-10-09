package com.lms.order_service.models.event;

import com.lms.order_service.models.entity.Order;

import java.time.Instant;
import java.util.UUID;

/** The `order.failed` contract. No consumer yet; additive-only like every published event. */
public record OrderFailedEvent(
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
        String errorCode,
        String errorMessage) {

    public static final String TYPE = "order.failed";

    public static OrderFailedEvent of(Order order, String errorCode, String errorMessage, Instant now) {
        return new OrderFailedEvent(UUID.randomUUID().toString(), TYPE, now, order.getTenantId(),
                order.getId().toString(), order.getUserId(), order.getCourseId(), order.getAmountMinor(),
                order.getCurrency(), order.getProvider().name(), errorCode, errorMessage);
    }
}
