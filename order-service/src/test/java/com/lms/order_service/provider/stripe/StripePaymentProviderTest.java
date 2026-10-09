package com.lms.order_service.provider.stripe;

import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.WebhookVerification;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Event shapes follow Stripe's documented Checkout Session and Refund objects. */
class StripePaymentProviderTest {

    private static final String SECRET = "whsec_test";
    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");

    private final StripePaymentProvider provider = new StripePaymentProvider(
            new StripeProperties(true, "sk_test", SECRET, "https://api.stripe.com",
                    "http://localhost:3000/courses/{courseId}?order={orderId}", "http://localhost:3000/courses/{courseId}",
                    Duration.ofSeconds(5), Duration.ofMinutes(5)),
            JsonMapper.builder().build(), Clock.fixed(NOW, ZoneOffset.UTC));

    private static String event(String type, String object) {
        return """
                {"id":"evt_1","object":"event","type":"%s","created":%d,"data":{"object":%s}}"""
                .formatted(type, NOW.getEpochSecond(), object);
    }

    private static final String PAID_SESSION = """
            {"id":"cs_test_1","object":"checkout.session","payment_status":"paid","status":"complete",
             "amount_total":49900,"currency":"inr","payment_intent":"pi_1","payment_method_types":["card"],
             "client_reference_id":"order-uuid"}""";

    private static Map<String, String> header(String body, long timestamp, String secret) {
        return Map.of(StripePaymentProvider.SIGNATURE_HEADER,
                "t=" + timestamp + ",v1=" + StripeSignature.sign(secret, timestamp, body));
    }

    private List<PaymentEvent> parse(String body) {
        WebhookVerification verified = provider.verify(body, header(body, NOW.getEpochSecond(), SECRET));
        assertThat(verified.valid()).isTrue();
        return provider.parse(verified);
    }

    @Test
    void aPaidSessionIsACaptureWithTheCurrencyNormalised() {
        assertThat(parse(event("checkout.session.completed", PAID_SESSION))).singleElement().satisfies(e -> {
            assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED);
            assertThat(e.providerOrderId()).isEqualTo("cs_test_1");
            assertThat(e.providerPaymentId()).isEqualTo("pi_1");
            assertThat(e.amountMinor()).isEqualTo(49900);
            assertThat(e.currency()).isEqualTo("INR");
            assertThat(e.providerEventId()).isEqualTo("evt_1");
        });
    }

    @Test
    void anUnpaidCompletedSessionWaitsForTheAsyncEvent() {
        String unpaid = PAID_SESSION.replace("\"payment_status\":\"paid\"", "\"payment_status\":\"unpaid\"");
        assertThat(parse(event("checkout.session.completed", unpaid))).isEmpty();
        assertThat(parse(event("checkout.session.async_payment_succeeded", unpaid))).singleElement()
                .satisfies(e -> assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED));
    }

    @Test
    void expiredAndFailedSessionsAreFailures() {
        assertThat(parse(event("checkout.session.expired", PAID_SESSION))).singleElement()
                .satisfies(e -> assertThat(e.errorCode()).isEqualTo("checkout_expired"));
        assertThat(parse(event("checkout.session.async_payment_failed", PAID_SESSION))).singleElement()
                .satisfies(e -> assertThat(e.type()).isEqualTo(PaymentEventType.PAYMENT_FAILED));
    }

    @Test
    void aSucceededRefundIsNormalised() {
        String refund = """
                {"id":"re_1","object":"refund","status":"succeeded","amount":10000,"currency":"inr","payment_intent":"pi_1"}""";
        assertThat(parse(event("refund.updated", refund))).singleElement().satisfies(e -> {
            assertThat(e.type()).isEqualTo(PaymentEventType.REFUND_PROCESSED);
            assertThat(e.providerRefundId()).isEqualTo("re_1");
            assertThat(e.providerPaymentId()).isEqualTo("pi_1");
        });
    }

    @Test
    void rejectsAStaleTimestampAWrongSecretAndTampering() {
        String body = event("checkout.session.completed", PAID_SESSION);
        long stale = NOW.minus(Duration.ofMinutes(6)).getEpochSecond();
        assertThat(provider.verify(body, header(body, stale, SECRET)).valid()).isFalse();
        assertThat(provider.verify(body, header(body, NOW.getEpochSecond(), "whsec_other")).valid()).isFalse();
        assertThat(provider.verify(body.replace("49900", "100"), header(body, NOW.getEpochSecond(), SECRET)).valid())
                .isFalse();
        assertThat(provider.verify(body, Map.of()).valid()).isFalse();
    }

    @Test
    void acceptsWhenAnyV1SignatureMatchesDuringSecretRotation() {
        String body = event("checkout.session.completed", PAID_SESSION);
        long t = NOW.getEpochSecond();
        String rotated = "t=" + t + ",v1=" + StripeSignature.sign("whsec_old", t, body) + ",v1="
                + StripeSignature.sign(SECRET, t, body);
        assertThat(provider.verify(body, Map.of(StripePaymentProvider.SIGNATURE_HEADER, rotated)).valid()).isTrue();
    }
}
