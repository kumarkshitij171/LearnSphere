package com.lms.order_service.models.response;

import java.util.Map;

/** Deliberately loose: each provider's browser SDK wants a different bag; the frontend switches on provider once. */
public record CheckoutResponse(String providerOrderId, String publicKey, Map<String, Object> params) {
}
