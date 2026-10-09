package com.lms.order_service.exception;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.ErrorType;
import com.lms.order_service.models.domain.OrderStatus;

public class IllegalTransitionException extends ApiException {

    public IllegalTransitionException(OrderStatus from, OrderStatus to, Actor actor) {
        super(ErrorType.CONFLICT, "Order cannot move from %s to %s (actor %s)".formatted(from, to, actor));
    }
}
