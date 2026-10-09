package com.lms.order_service.provider.mock;

import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.provider.CheckoutSession;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentSnapshot;
import com.lms.order_service.provider.RefundResult;
import com.lms.order_service.provider.WebhookVerification;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A gateway with no network: the whole order → payment → enrolment chain runs before any real
 * account exists, and it stays the test double. Webhooks use Razorpay's envelope
 * ({ event, payload.payment.entity }) so the Razorpay provider parses the same shape.
 */
@Component
@ConditionalOnProperty(name = "lms.payment.mock.enabled", havingValue = "true")
public class MockPaymentProvider implements PaymentProvider {

    static final String EVENT_CAPTURED = "payment.captured";
    static final String EVENT_FAILED = "payment.failed";

    private final ObjectMapper objectMapper;
    private final String webhookSecret;

    public MockPaymentProvider(ObjectMapper objectMapper,
                               @Value("${lms.payment.mock.webhook-secret}") String webhookSecret,
                               Environment environment) {
        // anyone could "pay" through the mock gateway, so it must never run in production
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            throw new IllegalStateException("lms.payment.mock.enabled must be false in the prod profile");
        }
        if (webhookSecret == null || webhookSecret.isBlank()) {
            throw new IllegalStateException("lms.payment.mock.webhook-secret must be set");
        }
        this.objectMapper = objectMapper;
        this.webhookSecret = webhookSecret;
    }

    @Override
    public PaymentProviderType type() {
        return PaymentProviderType.MOCK;
    }

    @Override
    public CheckoutSession createCheckout(Order order) {
        String providerOrderId = "mock_order_" + UUID.randomUUID().toString().replace("-", "");
        return new CheckoutSession(providerOrderId, null, Map.of(
                "name", "LearnSphere",
                "description", order.getCourseTitle(),
                "amount", order.getAmountMinor(),
                "currency", order.getCurrency()));
    }

    @Override
    public WebhookVerification verify(String rawBody, Map<String, String> headers) {
        if (rawBody == null || rawBody.isEmpty()) return WebhookVerification.invalid("empty body");
        if (!MockWebhookSignature.matches(webhookSecret, rawBody, headers.get(MockWebhookSignature.SIGNATURE_HEADER))) {
            return WebhookVerification.invalid("signature mismatch");
        }
        String eventId = headers.get(MockWebhookSignature.EVENT_ID_HEADER);
        if (eventId == null || eventId.isBlank()) return WebhookVerification.invalid("missing event id");
        try {
            JsonNode payload = objectMapper.readTree(rawBody);
            return WebhookVerification.verified(eventId, payload.path("event").asString(""), payload, rawBody);
        } catch (JacksonException e) {
            return WebhookVerification.invalid("body is not JSON");
        }
    }

    @Override
    public List<PaymentEvent> parse(WebhookVerification verified) {
        PaymentEventType type = switch (verified.eventType()) {
            case EVENT_CAPTURED -> PaymentEventType.PAYMENT_CAPTURED;
            case EVENT_FAILED -> PaymentEventType.PAYMENT_FAILED;
            default -> null;
        };
        if (type == null) return List.of();

        JsonNode entity = verified.payload().path("payload").path("payment").path("entity");
        long createdAt = verified.payload().path("created_at").asLong(Instant.now().getEpochSecond());
        return List.of(new PaymentEvent(
                verified.providerEventId(),
                type,
                textOrNull(entity, "order_id"),
                textOrNull(entity, "id"),
                entity.path("amount").asLong(-1),
                textOrNull(entity, "currency"),
                textOrNull(entity, "method"),
                textOrNull(entity, "error_code"),
                textOrNull(entity, "error_description"),
                Instant.ofEpochSecond(createdAt),
                null));
    }

    @Override
    public PaymentSnapshot fetch(Payment payment) {
        return PaymentSnapshot.unknown();
    }

    @Override
    public RefundResult refund(Payment payment, long amountMinor, String reason) {
        return new RefundResult(true, "mock_rfnd_" + UUID.randomUUID().toString().replace("-", ""), true, null);
    }

    String webhookSecret() {
        return webhookSecret;
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }
}
