package com.lms.order_service.provider;

import java.util.Map;

/** Public values only: this is serialised to the browser and stored on the payment row. */
public record CheckoutSession(String providerOrderId, String publicKey, Map<String, Object> params) {
}
