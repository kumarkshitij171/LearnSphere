package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.domain.RefundStatus;
import com.lms.order_service.models.domain.WebhookEventStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.models.entity.Refund;
import com.lms.order_service.models.event.OrderRefundedEvent;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.provider.RefundResult;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import com.lms.order_service.repository.RefundRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

/**
 * Admin-initiated refunds. One refund in flight per order, and pending refunds count against the
 * limit, so the refunded total can never exceed what was captured.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefundService {

    private static final EnumSet<OrderStatus> REFUNDABLE = EnumSet.of(OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED);
    private static final List<RefundStatus> COUNTED = List.of(RefundStatus.PENDING, RefundStatus.PROCESSED);

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final RefundRepository refundRepository;
    private final PaymentProviderRegistry registry;
    private final OrderStateMachine stateMachine;
    private final OutboxService outboxService;
    private final NotificationPublisher notificationPublisher;
    private final OrderProperties props;
    private final Clock clock;

    /** amountMinor null means "refund whatever remains". */
    @Transactional
    public Order request(UUID orderId, Long amountMinor, String reason, OrderContext admin) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .filter(o -> o.getTenantId().equals(admin.tenantId()))
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        if (!REFUNDABLE.contains(order.getStatus())) {
            throw ApiException.conflict("An order that is " + order.getStatus() + " cannot be refunded");
        }
        if (refundRepository.existsByOrderIdAndStatus(order.getId(), RefundStatus.PENDING)) {
            throw ApiException.conflict("A refund for this order is already in progress");
        }
        long remaining = order.getAmountMinor() - refundRepository.sumAmount(order.getId(), COUNTED);
        long amount = amountMinor == null ? remaining : amountMinor;
        if (amount <= 0 || amount > remaining) {
            throw ApiException.validation("Refund must be between 1 and %d (minor units)".formatted(remaining));
        }

        Payment payment = paymentRepository.findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(order.getId(),
                        List.of(PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED))
                .orElseThrow(() -> ApiException.conflict("This order has no captured payment to refund"));
        PaymentProvider provider = registry.get(order.getProvider())
                .orElseThrow(() -> ApiException.validation("Payment provider " + order.getProvider() + " is not enabled"));

        Refund refund = refundRepository.save(Refund.pending(order, payment, amount, reason, admin.userId()));
        stateMachine.transition(order, OrderStatus.REFUND_PENDING, Actor.ADMIN, "refund requested: " + reason);

        // a rejection or provider error rolls the refund row and the transition back together
        RefundResult result;
        try {
            result = provider.refund(payment, amount, reason);
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
        }
        if (!result.accepted()) {
            throw ApiException.providerPermanent("The provider rejected the refund: " + result.errorMessage(), null);
        }
        refund.setProviderRefundId(result.providerRefundId());
        refundRepository.saveAndFlush(refund);
        log.info("Refund {} of {} {} requested on order {} by {}", result.providerRefundId(), amount,
                order.getCurrency(), order.getId(), admin.userId());

        if (result.processed()) complete(refund, order, payment, Actor.SYSTEM);
        return order;
    }

    /** A refund webhook (or a provider response) confirming or rejecting a pending refund. */
    @Transactional(propagation = Propagation.MANDATORY)
    public PaymentEventHandler.Result applyProviderEvent(PaymentEvent event, boolean succeeded) {
        Refund refund = event.providerRefundId() == null ? null
                : refundRepository.findByProviderRefundId(event.providerRefundId()).orElse(null);
        if (refund == null) {
            log.warn("Refund event {} for unknown refund {} (made outside LearnSphere?)", event.providerEventId(),
                    event.providerRefundId());
            return new PaymentEventHandler.Result(WebhookEventStatus.IGNORED, "unknown refund " + event.providerRefundId());
        }
        if (refund.getStatus() != RefundStatus.PENDING) {
            return new PaymentEventHandler.Result(WebhookEventStatus.IGNORED, "refund already " + refund.getStatus());
        }
        Order order = orderRepository.findByIdForUpdate(refund.getOrderId()).orElseThrow();
        Payment payment = paymentRepository.findById(refund.getPaymentId()).orElseThrow();

        if (succeeded) {
            complete(refund, order, payment, Actor.WEBHOOK);
            return new PaymentEventHandler.Result(WebhookEventStatus.PROCESSED, "refund processed");
        }
        refund.setStatus(RefundStatus.FAILED);
        refund.setError(event.errorMessage());
        boolean earlierRefunds = refundRepository.sumAmount(order.getId(), List.of(RefundStatus.PROCESSED)) > 0;
        stateMachine.transition(order, earlierRefunds ? OrderStatus.PARTIALLY_REFUNDED : OrderStatus.PAID,
                Actor.WEBHOOK, "refund failed at the provider");
        log.error("ALERT refund {} on order {} failed at the provider", refund.getProviderRefundId(), order.getId());
        return new PaymentEventHandler.Result(WebhookEventStatus.PROCESSED, "refund failed");
    }

    private void complete(Refund refund, Order order, Payment payment, Actor actor) {
        refund.setStatus(RefundStatus.PROCESSED);
        refundRepository.saveAndFlush(refund);
        long total = refundRepository.sumAmount(order.getId(), List.of(RefundStatus.PROCESSED));
        boolean full = total >= order.getAmountMinor();

        payment.setStatus(full ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED);
        stateMachine.transition(order, full ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED, actor,
                "refund %s processed".formatted(refund.getProviderRefundId()));
        outboxService.enqueue(props.topics().refunded(), order, OrderRefundedEvent.of(order,
                refund.getProviderRefundId(), refund.getAmountMinor(), total, clock.instant()));
        notificationPublisher.refundProcessed(order, refund.getProviderRefundId(), refund.getAmountMinor());
    }
}
