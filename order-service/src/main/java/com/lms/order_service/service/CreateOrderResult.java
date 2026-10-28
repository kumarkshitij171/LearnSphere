package com.lms.order_service.service;

import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;

/** replayed=true means an existing order answered the request: 200 rather than 201. */
public record CreateOrderResult(Order order, Payment payment, boolean replayed) {

    public static CreateOrderResult created(Order order, Payment payment) {
        return new CreateOrderResult(order, payment, false);
    }

    public static CreateOrderResult replay(Order order, Payment payment) {
        return new CreateOrderResult(order, payment, true);
    }
}
