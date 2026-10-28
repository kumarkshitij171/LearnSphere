package com.lms.order_service.models.domain;

import java.util.Arrays;
import java.util.Optional;

/** Constants exist before their providers do, so asking for one is a clean 400 rather than a crash. */
public enum PaymentProviderType {
    MOCK,
    RAZORPAY,
    STRIPE,
    // free orders: no gateway involved
    NONE;

    public static Optional<PaymentProviderType> fromPath(String value) {
        return Arrays.stream(values())
                .filter(type -> type != NONE && type.name().equalsIgnoreCase(value))
                .findFirst();
    }
}
