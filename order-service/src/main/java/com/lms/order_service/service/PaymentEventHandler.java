package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.domain.WebhookEventStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.models.event.OrderFailedEvent;
import com.lms.order_service.models.event.OrderPaidEvent;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/** Applies one normalised payment event to its order. Provider-agnostic by construction. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentEventHandler {

    private static final Set<OrderStatus> ALREADY_PAID = EnumSet.of(OrderStatus.PAID, OrderStatus.REFUND_PENDING,
            OrderStatus.PARTIALLY_REFUNDED, OrderStatus.REFUNDED);

    public record Result(WebhookEventStatus status, String detail) {
    }

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final OrderStateMachine stateMachine;
    private final OutboxService outboxService;
    private final NotificationPublisher notificationPublisher;
    private final RefundService refundService;
    private final OrderProperties props;
    private final Clock clock;

    @Transactional(propagation = Propagation.MANDATORY)
    public Result apply(PaymentProviderType provider, PaymentEvent event, Actor actor) {
        if (event.type() == PaymentEventType.REFUND_PROCESSED) return refundService.applyProviderEvent(event, true);
        if (event.type() == PaymentEventType.REFUND_FAILED) return refundService.applyProviderEvent(event, false);

        Payment payment = paymentRepository
                .findFirstByProviderAndProviderOrderIdOrderByCreatedAtDesc(provider, event.providerOrderId())
                .orElse(null);
        if (payment == null) {
            log.warn("{} webhook for unknown provider order {}", provider, event.providerOrderId());
            return new Result(WebhookEventStatus.IGNORED, "unknown provider order " + event.providerOrderId());
        }
        Order order = orderRepository.findByIdForUpdate(payment.getOrderId()).orElseThrow();

        return switch (event.type()) {
            case PAYMENT_CAPTURED -> captured(order, payment, event, actor);
            case PAYMENT_FAILED -> failed(order, payment, event, actor);
            case REFUND_PROCESSED, REFUND_FAILED -> throw new IllegalStateException("handled above");
        };
    }

    private Result captured(Order order, Payment payment, PaymentEvent event, Actor actor) {
        if (ALREADY_PAID.contains(order.getStatus())) {
            if (Objects.equals(payment.getProviderPaymentId(), event.providerPaymentId())) {
                return new Result(WebhookEventStatus.IGNORED, "order already paid");
            }
            // a second, different capture: the buyer was charged twice
            log.error("ALERT duplicate capture: order {} is {} but {} captured payment {}", order.getId(),
                    order.getStatus(), order.getProvider(), event.providerPaymentId());
            return new Result(WebhookEventStatus.FAILED, "duplicate capture on a paid order; refund required");
        }
        if (event.amountMinor() != order.getAmountMinor() || !order.getCurrency().equals(event.currency())) {
            log.error("ALERT amount mismatch on order {}: expected {} {}, provider captured {} {}", order.getId(),
                    order.getAmountMinor(), order.getCurrency(), event.amountMinor(), event.currency());
            return new Result(WebhookEventStatus.FAILED, "captured amount does not match the order");
        }

        OrderStatus before = order.getStatus();
        payment.setStatus(PaymentStatus.CAPTURED);
        payment.setProviderPaymentId(event.providerPaymentId());
        payment.setMethod(event.method());
        payment.setErrorCode(null);
        payment.setErrorMessage(null);
        String reason = before == OrderStatus.PENDING ? "payment captured" : "late capture after " + before;
        stateMachine.transition(order, OrderStatus.PAID, actor, reason);
        outboxService.enqueue(props.topics().paid(), order,
                OrderPaidEvent.of(order, event.providerPaymentId(), clock.instant()));
        notificationPublisher.receipt(order, event.providerPaymentId());
        if (before != OrderStatus.PENDING) {
            log.warn("Order {} captured after it was {}; recorded as PAID", order.getId(), before);
        }
        log.info("Order {} PAID via {} payment {}", order.getId(), order.getProvider(), event.providerPaymentId());
        return new Result(WebhookEventStatus.PROCESSED, reason);
    }

    private Result failed(Order order, Payment payment, PaymentEvent event, Actor actor) {
        if (order.getStatus() != OrderStatus.PENDING) {
            return new Result(WebhookEventStatus.IGNORED, "order is " + order.getStatus());
        }
        payment.setStatus(PaymentStatus.FAILED);
        payment.setProviderPaymentId(event.providerPaymentId());
        payment.setErrorCode(event.errorCode());
        payment.setErrorMessage(truncate(event.errorMessage()));
        stateMachine.transition(order, OrderStatus.FAILED, actor,
                "payment failed: " + (event.errorCode() == null ? "unknown" : event.errorCode()));
        outboxService.enqueue(props.topics().failed(), order,
                OrderFailedEvent.of(order, event.errorCode(), event.errorMessage(), clock.instant()));
        notificationPublisher.paymentFailed(order, event.providerPaymentId(), event.errorMessage());
        return new Result(WebhookEventStatus.PROCESSED, "payment failed");
    }

    private static String truncate(String value) {
        return value == null || value.length() <= 512 ? value : value.substring(0, 512);
    }
}
