package com.lms.order_service.provider;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PaymentProviderRegistryTest {

    private static PaymentProvider stub(PaymentProviderType type) {
        return new PaymentProvider() {
            public PaymentProviderType type() { return type; }
            public CheckoutSession createCheckout(Order order) { return null; }
            public WebhookVerification verify(String rawBody, Map<String, String> headers) { return null; }
            public List<PaymentEvent> parse(WebhookVerification verified) { return List.of(); }
            public PaymentSnapshot fetch(Payment payment) { return PaymentSnapshot.unknown(); }
            public RefundResult refund(Payment payment, long amountMinor, String reason) { return null; }
        };
    }

    @Test
    void looksProvidersUpByType() {
        var registry = new PaymentProviderRegistry(List.of(stub(PaymentProviderType.MOCK)));
        assertThat(registry.get(PaymentProviderType.MOCK)).isPresent();
        assertThat(registry.get(PaymentProviderType.RAZORPAY)).isEmpty();
        assertThat(registry.enabled()).containsExactly(PaymentProviderType.MOCK);
    }

    @Test
    void twoProvidersForOneTypeIsAStartupError() {
        assertThatThrownBy(() -> new PaymentProviderRegistry(
                List.of(stub(PaymentProviderType.MOCK), stub(PaymentProviderType.MOCK))))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void webhookPathsResolveCaseInsensitivelyAndNeverToNone() {
        assertThat(PaymentProviderType.fromPath("razorpay")).contains(PaymentProviderType.RAZORPAY);
        assertThat(PaymentProviderType.fromPath("MOCK")).contains(PaymentProviderType.MOCK);
        assertThat(PaymentProviderType.fromPath("none")).isEmpty();
        assertThat(PaymentProviderType.fromPath("paypal")).isEmpty();
    }
}
