package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.event.NotificationMessage;
import com.lms.order_service.models.event.NotificationTarget;
import com.lms.order_service.utils.MoneyFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Builds the emails a purchase triggers and puts them on the outbox, in the same transaction as
 * the state change. notificationId derives from the order, so a redelivered event reuses the same
 * id and notification-service's idempotency claim suppresses the duplicate email.
 */
@Component
@RequiredArgsConstructor
public class NotificationPublisher {

    static final String RECEIPT = "order-receipt";
    static final String PAYMENT_FAILED = "payment-failed";
    static final String REFUND_PROCESSED = "refund-processed";

    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    private final OutboxService outboxService;
    private final OrderProperties props;

    public void receipt(Order order, String providerPaymentId) {
        Map<String, String> vars = base(order);
        vars.put("amount", order.isFree() ? "Free" : MoneyFormat.display(order.getAmountMinor(), order.getCurrency()));
        vars.put("paymentId", providerPaymentId == null ? "—" : providerPaymentId);
        vars.put("purchasedAt", DATE.format(order.getPaidAt() == null ? Instant.now() : order.getPaidAt()));
        publish(order, order.getId() + ":receipt", RECEIPT, vars);
    }

    public void paymentFailed(Order order, String providerPaymentId, String errorMessage) {
        Map<String, String> vars = base(order);
        vars.put("amount", MoneyFormat.display(order.getAmountMinor(), order.getCurrency()));
        vars.put("reason", StringUtils.hasText(errorMessage) ? errorMessage : "The payment was declined");
        // one email per failed attempt, not one per order
        publish(order, order.getId() + ":payment-failed:" + (providerPaymentId == null ? "unknown" : providerPaymentId),
                PAYMENT_FAILED, vars);
    }

    public void refundProcessed(Order order, String refundId, long refundedMinor) {
        Map<String, String> vars = base(order);
        vars.put("amount", MoneyFormat.display(refundedMinor, order.getCurrency()));
        vars.put("refundId", refundId);
        publish(order, order.getId() + ":refund:" + refundId, REFUND_PROCESSED, vars);
    }

    private Map<String, String> base(Order order) {
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("name", StringUtils.hasText(order.getUserName()) ? order.getUserName() : "there");
        vars.put("courseTitle", order.getCourseTitle());
        vars.put("orderId", order.getId().toString());
        return vars;
    }

    private void publish(Order order, String notificationId, String template, Map<String, String> vars) {
        outboxService.enqueue(props.topics().notifications(), order, new NotificationMessage(notificationId,
                order.getTenantId(), order.getUserId(), List.of("EMAIL"), template,
                new NotificationTarget(order.getUserEmail(), null, null), vars, 0));
    }
}
