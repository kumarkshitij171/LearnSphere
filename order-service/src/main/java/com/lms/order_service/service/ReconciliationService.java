package com.lms.order_service.service;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.provider.PaymentSnapshot;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Recovers what lost webhooks would have told us, by asking the provider directly
 * (SYSTEM_DESIGN.md §7.3), and expires abandoned orders (§7.4). Drives the same guarded
 * transitions a webhook would, so a sweep racing a late webhook is harmless.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReconciliationService {

    public enum Outcome { SKIPPED, PAID, FAILED, EXPIRED, STILL_PENDING }

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentProviderRegistry registry;
    private final PaymentEventHandler paymentEventHandler;
    private final OrderStateMachine stateMachine;
    private final Clock clock;

    @Transactional
    public Outcome reconcile(UUID orderId) {
        Order order = orderRepository.lockIfFree(orderId).orElse(null);
        if (order == null || !OrderTransitions.isActive(order.getStatus())) return Outcome.SKIPPED;

        Instant now = clock.instant();
        boolean expired = !order.getExpiresAt().isAfter(now);
        Payment payment = paymentRepository.findFirstByOrderIdOrderByCreatedAtDesc(order.getId()).orElse(null);
        PaymentProvider provider = registry.get(order.getProvider()).orElse(null);

        if (order.getStatus() == OrderStatus.PENDING && payment != null && provider != null) {
            // a provider error propagates: this order rolls back and is retried on the next sweep
            PaymentSnapshot snapshot = provider.fetch(payment);
            if (snapshot.known() && snapshot.status() == PaymentStatus.CAPTURED) {
                PaymentEventHandler.Result result = paymentEventHandler.apply(order.getProvider(),
                        syntheticEvent(PaymentEventType.PAYMENT_CAPTURED, payment, snapshot, now), Actor.SWEEPER);
                log.warn("Sweeper recovered a capture for order {} the webhook never delivered: {}", order.getId(),
                        result.detail());
                return order.getStatus() == OrderStatus.PAID ? Outcome.PAID : Outcome.STILL_PENDING;
            }
            if (snapshot.known() && snapshot.status() == PaymentStatus.FAILED) {
                paymentEventHandler.apply(order.getProvider(),
                        syntheticEvent(PaymentEventType.PAYMENT_FAILED, payment, snapshot, now), Actor.SWEEPER);
                return Outcome.FAILED;
            }
        }
        if (!expired) return Outcome.STILL_PENDING;
        stateMachine.transition(order, OrderStatus.EXPIRED, Actor.SWEEPER,
                "expired with no completed payment at the provider");
        return Outcome.EXPIRED;
    }

    private static PaymentEvent syntheticEvent(PaymentEventType type, Payment payment, PaymentSnapshot snapshot,
                                               Instant now) {
        return new PaymentEvent("sweep:" + payment.getId(), type, payment.getProviderOrderId(),
                snapshot.providerPaymentId(), snapshot.amountMinor(), snapshot.currency(), null,
                type == PaymentEventType.PAYMENT_FAILED ? "RECONCILED_FAILED" : null,
                type == PaymentEventType.PAYMENT_FAILED ? "The provider reports this payment failed" : null, now, null);
    }
}
