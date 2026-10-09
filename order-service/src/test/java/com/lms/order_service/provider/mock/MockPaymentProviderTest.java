package com.lms.order_service.provider.mock;

import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.WebhookVerification;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MockPaymentProviderTest {

    private static final String SECRET = "mock_webhook_secret";
    private static final String CAPTURED = """
            {"event":"payment.captured","created_at":1791453600,"payload":{"payment":{"entity":
            {"id":"mock_pay_1","order_id":"mock_order_1","amount":49900,"currency":"INR","method":"upi",
            "status":"captured","error_code":null,"error_description":null}}}}""";

    private final MockPaymentProvider provider =
            new MockPaymentProvider(JsonMapper.builder().build(), SECRET, new MockEnvironment());

    private static Map<String, String> headers(String body, String secret) {
        return Map.of(MockWebhookSignature.SIGNATURE_HEADER, MockWebhookSignature.sign(secret, body),
                MockWebhookSignature.EVENT_ID_HEADER, "mock_evt_1");
    }

    @Test
    void verifiesAndNormalisesACapture() {
        WebhookVerification verified = provider.verify(CAPTURED, headers(CAPTURED, SECRET));
        assertThat(verified.valid()).isTrue();
        assertThat(verified.providerEventId()).isEqualTo("mock_evt_1");

        List<PaymentEvent> events = provider.parse(verified);
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED);
            assertThat(event.providerOrderId()).isEqualTo("mock_order_1");
            assertThat(event.providerPaymentId()).isEqualTo("mock_pay_1");
            assertThat(event.amountMinor()).isEqualTo(49900);
            assertThat(event.currency()).isEqualTo("INR");
            assertThat(event.errorCode()).isNull();
        });
    }

    @Test
    void rejectsATamperedBody() {
        String tampered = CAPTURED.replace("49900", "100");
        assertThat(provider.verify(tampered, headers(CAPTURED, SECRET)).valid()).isFalse();
    }

    @Test
    void rejectsTheWrongSecretAndMissingHeaders() {
        assertThat(provider.verify(CAPTURED, headers(CAPTURED, "other")).valid()).isFalse();
        assertThat(provider.verify(CAPTURED, Map.of()).valid()).isFalse();
        assertThat(provider.verify(CAPTURED, Map.of(MockWebhookSignature.SIGNATURE_HEADER,
                MockWebhookSignature.sign(SECRET, CAPTURED))).valid()).isFalse();
    }

    @Test
    void unknownEventTypesParseToNothing() {
        String body = "{\"event\":\"order.notified\",\"payload\":{}}";
        assertThat(provider.parse(provider.verify(body, headers(body, SECRET)))).isEmpty();
    }

    @Test
    void refusesToStartInProd() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new MockPaymentProvider(JsonMapper.builder().build(), SECRET, prod))
                .isInstanceOf(IllegalStateException.class);
    }
}
