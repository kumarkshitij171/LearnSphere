package com.lms.order_service.models.context;

import com.lms.order_service.exception.ApiException;

public final class OrderContextHolder {

    private static final ThreadLocal<OrderContext> CONTEXT = new ThreadLocal<>();

    private OrderContextHolder() {
    }

    public static void set(OrderContext context) {
        CONTEXT.set(context);
    }

    public static OrderContext require() {
        OrderContext context = CONTEXT.get();
        if (context == null) throw ApiException.unauthorized("Authentication required");
        return context;
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
