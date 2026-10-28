package com.lms.order_service.service;

import com.lms.order_service.exception.IllegalTransitionException;
import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.OrderEvent;
import com.lms.order_service.repository.OrderEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;

/** The one place an order changes state; every change leaves an order_events row behind. */
@Component
@RequiredArgsConstructor
public class OrderStateMachine {

    private final OrderEventRepository orderEventRepository;
    private final Clock clock;

    public void recordCreated(Order order, Actor actor) {
        orderEventRepository.save(OrderEvent.of(order.getId(), null, order.getStatus(), "order created", actor,
                clock.instant()));
    }

    public void transition(Order order, OrderStatus to, Actor actor, String reason) {
        OrderStatus from = order.getStatus();
        if (!OrderTransitions.isAllowed(from, to, actor, order.isFree())) {
            throw new IllegalTransitionException(from, to, actor);
        }
        order.applyTransition(to, clock.instant());
        orderEventRepository.save(OrderEvent.of(order.getId(), from, to, reason, actor, clock.instant()));
    }
}
