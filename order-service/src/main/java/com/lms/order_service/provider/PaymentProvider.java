package com.lms.order_service.provider;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;

import java.util.List;
import java.util.Map;

/**
 * Everything gateway-specific. The order logic only ever reaches a provider through
 * PaymentProviderRegistry; if adding one means touching OrderService, the seam is being bypassed.
 */
public interface PaymentProvider {

    PaymentProviderType type();

    /** Creates the provider-side order. Returns what the browser needs to start checkout. */
    CheckoutSession createCheckout(Order order);

    /** Verifies the raw webhook bytes. Never parses before verifying. Header names are lower-case. */
    WebhookVerification verify(String rawBody, Map<String, String> headers);

    /** Normalises a verified webhook into provider-free events. One webhook may carry several. */
    List<PaymentEvent> parse(WebhookVerification verified);

    /**
     * The provider's own view of a payment attempt: the reconciliation path. Takes the row because a
     * lost webhook means providerPaymentId may still be unknown; only providerOrderId is.
     */
    PaymentSnapshot fetch(Payment payment);

    RefundResult refund(Payment payment, long amountMinor, String reason);
}
