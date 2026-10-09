package com.lms.order_service.provider.razorpay;

import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.WebhookVerification;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Payload shapes follow Razorpay's documented webhook envelope. */
class RazorpayPaymentProviderTest {

    private static final String WEBHOOK_SECRET = "rzp_webhook_secret";

    private final RazorpayPaymentProvider provider = new RazorpayPaymentProvider(
            new RazorpayProperties(true, "rzp_test_key", "rzp_test_secret", WEBHOOK_SECRET,
                    "https://api.razorpay.com", Duration.ofSeconds(5)),
            JsonMapper.builder().build());

    private static final String CAPTURED = """
            {"entity":"event","account_id":"acc_1","event":"payment.captured","contains":["payment"],
             "payload":{"payment":{"entity":{"id":"pay_29QQoUBi66xm2f","entity":"payment","amount":49900,
             "currency":"INR","status":"captured","order_id":"order_9A33XWu170gUtm","method":"upi",
             "captured":true,"error_code":null,"error_description":null}}},"created_at":1791453600}""";

    private static final String FAILED = """
            {"entity":"event","event":"payment.failed","contains":["payment"],
             "payload":{"payment":{"entity":{"id":"pay_fail_1","amount":49900,"currency":"INR","status":"failed",
             "order_id":"order_9A33XWu170gUtm","method":"card","error_code":"BAD_REQUEST_ERROR",
             "error_description":"Payment failed due to insufficient funds"}}},"created_at":1791453600}""";

    private static final String REFUND = """
            {"entity":"event","event":"refund.processed","contains":["refund","payment"],
             "payload":{"refund":{"entity":{"id":"rfnd_1","payment_id":"pay_29QQoUBi66xm2f","amount":10000,
             "currency":"INR","status":"processed"}}},"created_at":1791453600}""";

    private static Map<String, String> headers(String body) {
        return Map.of(RazorpayPaymentProvider.SIGNATURE_HEADER, RazorpaySignature.sign(WEBHOOK_SECRET, body),
                RazorpayPaymentProvider.EVENT_ID_HEADER, "evt_1");
    }

    private List<PaymentEvent> parse(String body) {
        WebhookVerification verified = provider.verify(body, headers(body));
        assertThat(verified.valid()).isTrue();
        return provider.parse(verified);
    }

    @Test
    void normalisesACapture() {
        assertThat(parse(CAPTURED)).singleElement().satisfies(e -> {
            assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED);
            assertThat(e.providerOrderId()).isEqualTo("order_9A33XWu170gUtm");
            assertThat(e.providerPaymentId()).isEqualTo("pay_29QQoUBi66xm2f");
            assertThat(e.amountMinor()).isEqualTo(49900);
            assertThat(e.currency()).isEqualTo("INR");
            assertThat(e.method()).isEqualTo("upi");
            assertThat(e.providerEventId()).isEqualTo("evt_1");
        });
    }

    @Test
    void orderPaidIsTreatedAsTheSameCapture() {
        String orderPaid = CAPTURED.replace("\"payment.captured\"", "\"order.paid\"");
        assertThat(parse(orderPaid)).singleElement()
                .satisfies(e -> assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED));
    }

    @Test
    void normalisesAFailureWithItsReason() {
        assertThat(parse(FAILED)).singleElement().satisfies(e -> {
            assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_FAILED);
            assertThat(e.errorCode()).isEqualTo("BAD_REQUEST_ERROR");
            assertThat(e.errorMessage()).contains("insufficient funds");
        });
    }

    @Test
    void normalisesAProcessedRefund() {
        assertThat(parse(REFUND)).singleElement().satisfies(e -> {
            assertThat(e.type()).isEqualTo(PaymentEventType.REFUND_PROCESSED);
            assertThat(e.providerRefundId()).isEqualTo("rfnd_1");
            assertThat(e.providerPaymentId()).isEqualTo("pay_29QQoUBi66xm2f");
            assertThat(e.amountMinor()).isEqualTo(10000);
        });
    }

    @Test
    void ignoresEventsItDoesNotHandle() {
        String other = CAPTURED.replace("\"payment.captured\"", "\"payment.authorized\"");
        assertThat(parse(other)).isEmpty();
    }

    @Test
    void rejectsTamperingTheWrongSecretAndAMissingEventId() {
        assertThat(provider.verify(CAPTURED.replace("49900", "100"), headers(CAPTURED)).valid()).isFalse();
        assertThat(provider.verify(CAPTURED, Map.of(RazorpayPaymentProvider.SIGNATURE_HEADER,
                RazorpaySignature.sign("other", CAPTURED), RazorpayPaymentProvider.EVENT_ID_HEADER, "e")).valid()).isFalse();
        assertThat(provider.verify(CAPTURED, Map.of(RazorpayPaymentProvider.SIGNATURE_HEADER,
                RazorpaySignature.sign(WEBHOOK_SECRET, CAPTURED))).valid()).isFalse();
    }

    @Test
    void refusesToStartWithoutCredentials() {
        assertThatThrownBy(() -> new RazorpayPaymentProvider(new RazorpayProperties(true, "k", "s", "",
                "https://api.razorpay.com", Duration.ofSeconds(5)), JsonMapper.builder().build()))
                .isInstanceOf(IllegalStateException.class);
    }
}
