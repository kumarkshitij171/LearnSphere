package com.lms.order_service.provider.razorpay;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.provider.CheckoutSession;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentSnapshot;
import com.lms.order_service.provider.RefundResult;
import com.lms.order_service.provider.WebhookVerification;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Razorpay over its REST API (orders, payments, refunds) and its webhooks. Checkout runs in the
 * browser via checkout.js with the order id created here; only the webhook marks money received.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "lms.payment.razorpay.enabled", havingValue = "true")
public class RazorpayPaymentProvider implements PaymentProvider {

    static final String SIGNATURE_HEADER = "x-razorpay-signature";
    static final String EVENT_ID_HEADER = "x-razorpay-event-id";

    private final RazorpayProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient client;

    public RazorpayPaymentProvider(RazorpayProperties props, ObjectMapper objectMapper) {
        require(props.keyId(), "lms.payment.razorpay.key-id");
        require(props.keySecret(), "lms.payment.razorpay.key-secret");
        require(props.webhookSecret(), "lms.payment.razorpay.webhook-secret");
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeout());
        factory.setReadTimeout(props.timeout());
        String basic = Base64.getEncoder()
                .encodeToString((props.keyId() + ":" + props.keySecret()).getBytes(StandardCharsets.UTF_8));
        this.client = RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Authorization", "Basic " + basic)
                .build();
    }

    @Override
    public PaymentProviderType type() {
        return PaymentProviderType.RAZORPAY;
    }

    @Override
    public CheckoutSession createCheckout(Order order) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", order.getAmountMinor());
        body.put("currency", order.getCurrency());
        // receipt is capped at 40 chars; a dash-less UUID is 32
        body.put("receipt", order.getId().toString().replace("-", ""));
        body.put("notes", Map.of("orderId", order.getId().toString(), "courseId", order.getCourseId(),
                "userId", order.getUserId()));

        JsonNode created = call("create order " + order.getId(), () -> client.post().uri("/v1/orders")
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class));
        String providerOrderId = created.path("id").asString("");
        if (providerOrderId.isEmpty()) {
            throw ApiException.providerPermanent("Razorpay returned no order id", null);
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "LearnSphere");
        params.put("description", order.getCourseTitle());
        params.put("amount", order.getAmountMinor());
        params.put("currency", order.getCurrency());
        Map<String, String> prefill = new LinkedHashMap<>();
        prefill.put("email", order.getUserEmail());
        if (order.getUserName() != null) prefill.put("name", order.getUserName());
        params.put("prefill", prefill);
        return new CheckoutSession(providerOrderId, props.keyId(), params);
    }

    @Override
    public WebhookVerification verify(String rawBody, Map<String, String> headers) {
        if (rawBody == null || rawBody.isEmpty()) return WebhookVerification.invalid("empty body");
        if (!RazorpaySignature.matches(props.webhookSecret(), rawBody, headers.get(SIGNATURE_HEADER))) {
            return WebhookVerification.invalid("signature mismatch");
        }
        String eventId = headers.get(EVENT_ID_HEADER);
        if (eventId == null || eventId.isBlank()) return WebhookVerification.invalid("missing x-razorpay-event-id");
        try {
            JsonNode payload = objectMapper.readTree(rawBody);
            return WebhookVerification.verified(eventId, payload.path("event").asString(""), payload, rawBody);
        } catch (JacksonException e) {
            return WebhookVerification.invalid("body is not JSON");
        }
    }

    @Override
    public List<PaymentEvent> parse(WebhookVerification verified) {
        JsonNode payload = verified.payload().path("payload");
        Instant at = Instant.ofEpochSecond(verified.payload().path("created_at").asLong(Instant.now().getEpochSecond()));
        return switch (verified.eventType()) {
            // order.paid repeats payment.captured; the second is answered "already paid"
            case "payment.captured", "order.paid" -> List.of(paymentEvent(verified, PaymentEventType.PAYMENT_CAPTURED,
                    payload.path("payment").path("entity"), at));
            case "payment.failed" -> List.of(paymentEvent(verified, PaymentEventType.PAYMENT_FAILED,
                    payload.path("payment").path("entity"), at));
            case "refund.processed", "refund.failed" -> {
                JsonNode refund = payload.path("refund").path("entity");
                PaymentEventType type = verified.eventType().equals("refund.processed")
                        ? PaymentEventType.REFUND_PROCESSED : PaymentEventType.REFUND_FAILED;
                yield List.of(new PaymentEvent(verified.providerEventId(), type, null,
                        text(refund, "payment_id"), refund.path("amount").asLong(-1), text(refund, "currency"),
                        null, null, type == PaymentEventType.REFUND_FAILED ? "The provider could not process the refund" : null,
                        at, text(refund, "id")));
            }
            default -> List.of();
        };
    }

    @Override
    public PaymentSnapshot fetch(Payment payment) {
        JsonNode entity;
        if (payment.getProviderPaymentId() != null) {
            entity = call("fetch payment", () -> client.get()
                    .uri("/v1/payments/{id}", payment.getProviderPaymentId()).retrieve().body(JsonNode.class));
        } else {
            JsonNode attempts = call("fetch order payments", () -> client.get()
                    .uri("/v1/orders/{id}/payments", payment.getProviderOrderId()).retrieve().body(JsonNode.class));
            entity = pick(attempts.path("items"));
            if (entity == null) return PaymentSnapshot.unknown();
        }
        PaymentStatus status = switch (entity.path("status").asString("")) {
            case "captured" -> PaymentStatus.CAPTURED;
            case "failed" -> PaymentStatus.FAILED;
            case "authorized" -> PaymentStatus.AUTHORIZED;
            case "refunded" -> PaymentStatus.REFUNDED;
            default -> null;
        };
        if (status == null) return PaymentSnapshot.unknown();
        return new PaymentSnapshot(true, status, text(entity, "id"), entity.path("amount").asLong(-1),
                text(entity, "currency"));
    }

    @Override
    public RefundResult refund(Payment payment, long amountMinor, String reason) {
        JsonNode refund = call("refund " + payment.getProviderPaymentId(), () -> client.post()
                .uri("/v1/payments/{id}/refund", payment.getProviderPaymentId())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("amount", amountMinor, "notes", Map.of("reason", reason == null ? "" : reason)))
                .retrieve().body(JsonNode.class));
        String id = text(refund, "id");
        if (id == null) return new RefundResult(false, null, false, "Razorpay returned no refund id");
        return new RefundResult(true, id, "processed".equals(refund.path("status").asString("")), null);
    }

    // a captured attempt is the answer; otherwise the most recent attempt
    private static JsonNode pick(JsonNode items) {
        JsonNode latest = null;
        for (JsonNode item : items) {
            if ("captured".equals(item.path("status").asString(""))) return item;
            if (latest == null || item.path("created_at").asLong() > latest.path("created_at").asLong()) latest = item;
        }
        return latest;
    }

    private static PaymentEvent paymentEvent(WebhookVerification verified, PaymentEventType type, JsonNode entity,
                                             Instant at) {
        return new PaymentEvent(verified.providerEventId(), type, text(entity, "order_id"), text(entity, "id"),
                entity.path("amount").asLong(-1), text(entity, "currency"), text(entity, "method"),
                text(entity, "error_code"), text(entity, "error_description"), at, null);
    }

    private <T> T call(String what, Supplier<T> request) {
        try {
            T result = request.get();
            if (result == null) throw ApiException.providerPermanent("Razorpay returned an empty response", null);
            return result;
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is5xxServerError() || e.getStatusCode().value() == 429) {
                throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
            }
            log.error("Razorpay rejected {}: {} {}", what, e.getStatusCode(), e.getResponseBodyAsString());
            throw ApiException.providerPermanent("The payment provider rejected the request", e);
        } catch (ResourceAccessException e) {
            throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private static void require(String value, String key) {
        if (value == null || value.isBlank()) throw new IllegalStateException(key + " must be set when Razorpay is enabled");
    }
}
