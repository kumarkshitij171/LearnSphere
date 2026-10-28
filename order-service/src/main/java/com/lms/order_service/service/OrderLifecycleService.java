package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.provider.CheckoutSession;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.EnumSet;
import java.util.UUID;

/** Buyer-initiated changes after creation: abandon a checkout, or try again after a decline. */
@Service
@RequiredArgsConstructor
public class OrderLifecycleService {

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentProviderRegistry registry;
    private final OrderStateMachine stateMachine;
    private final OrderProperties props;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Transactional
    public CreateOrderResult cancel(UUID orderId, OrderContext ctx) {
        Order order = lockOwned(orderId, ctx);
        if (!EnumSet.of(OrderStatus.CREATED, OrderStatus.PENDING, OrderStatus.FAILED).contains(order.getStatus())) {
            throw ApiException.conflict("An order that is " + order.getStatus() + " cannot be cancelled");
        }
        stateMachine.transition(order, OrderStatus.CANCELLED, Actor.USER, "cancelled by buyer");
        return CreateOrderResult.replay(order, null);
    }

    /** A fresh payment attempt against the same order and a fresh expiry window. */
    @Transactional
    public CreateOrderResult retry(UUID orderId, OrderContext ctx) {
        Order order = lockOwned(orderId, ctx);
        if (order.getStatus() != OrderStatus.FAILED) {
            throw ApiException.conflict("Only a failed order can be retried; this one is " + order.getStatus());
        }
        PaymentProvider provider = registry.get(order.getProvider())
                .orElseThrow(() -> ApiException.validation("Payment provider " + order.getProvider() + " is not enabled"));

        // back into the live set: uq_order_active rejects this if another live order exists for the course
        order.setExpiresAt(clock.instant().plus(props.ttl()));
        stateMachine.transition(order, OrderStatus.PENDING, Actor.USER, "payment retried");
        orderRepository.saveAndFlush(order);

        CheckoutSession session;
        try {
            session = provider.createCheckout(order);
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
        }
        Payment payment = paymentRepository.save(
                Payment.initiated(order, session.providerOrderId(), objectMapper.writeValueAsString(session)));
        return CreateOrderResult.replay(order, payment);
    }

    private Order lockOwned(UUID orderId, OrderContext ctx) {
        return orderRepository.findByIdForUpdate(orderId)
                .filter(o -> o.getTenantId().equals(ctx.tenantId()))
                .filter(o -> o.getUserId().equals(ctx.userId()))
                .orElseThrow(() -> ApiException.notFound("Order not found"));
    }
}
