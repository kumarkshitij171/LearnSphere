package com.lms.order_service.provider.stripe;

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
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Stripe Checkout (hosted, redirect) over the REST API. The providerOrderId is the Checkout
 * Session id; the providerPaymentId is its PaymentIntent. Phase 5's test of the seam: nothing
 * outside this package, its config and the STRIPE enum constant knows Stripe exists.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "lms.payment.stripe.enabled", havingValue = "true")
public class StripePaymentProvider implements PaymentProvider {

    static final String SIGNATURE_HEADER = "stripe-signature";
    // Stripe refuses a session that expires sooner than this
    private static final Duration MIN_SESSION_LIFETIME = Duration.ofMinutes(30);

    private final StripeProperties props;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final RestClient client;

    public StripePaymentProvider(StripeProperties props, ObjectMapper objectMapper, Clock clock) {
        require(props.secretKey(), "lms.payment.stripe.secret-key");
        require(props.webhookSecret(), "lms.payment.stripe.webhook-secret");
        require(props.successUrl(), "lms.payment.stripe.success-url");
        require(props.cancelUrl(), "lms.payment.stripe.cancel-url");
        this.props = props;
        this.objectMapper = objectMapper;
        this.clock = clock;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeout());
        factory.setReadTimeout(props.timeout());
        this.client = RestClient.builder()
                .baseUrl(props.baseUrl())
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + props.secretKey())
                .build();
    }

    @Override
    public PaymentProviderType type() {
        return PaymentProviderType.STRIPE;
    }

    @Override
    public CheckoutSession createCheckout(Order order) {
        String orderId = order.getId().toString();
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("mode", "payment");
        form.add("line_items[0][quantity]", "1");
        form.add("line_items[0][price_data][currency]", order.getCurrency().toLowerCase(Locale.ROOT));
        form.add("line_items[0][price_data][unit_amount]", Long.toString(order.getAmountMinor()));
        form.add("line_items[0][price_data][product_data][name]", order.getCourseTitle());
        form.add("client_reference_id", orderId);
        form.add("metadata[orderId]", orderId);
        form.add("payment_intent_data[metadata][orderId]", orderId);
        form.add("customer_email", order.getUserEmail());
        form.add("success_url", expand(props.successUrl(), order));
        form.add("cancel_url", expand(props.cancelUrl(), order));
        form.add("expires_at", Long.toString(clock.instant().plus(MIN_SESSION_LIFETIME).getEpochSecond()));

        JsonNode session = call("create session for " + orderId, () -> client.post().uri("/v1/checkout/sessions")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class));
        String id = text(session, "id");
        String url = text(session, "url");
        if (id == null || url == null) throw ApiException.providerPermanent("Stripe returned no checkout session", null);
        return new CheckoutSession(id, null, Map.of("url", url));
    }

    @Override
    public WebhookVerification verify(String rawBody, Map<String, String> headers) {
        if (rawBody == null || rawBody.isEmpty()) return WebhookVerification.invalid("empty body");
        if (!StripeSignature.matches(props.webhookSecret(), rawBody, headers.get(SIGNATURE_HEADER), clock.instant(),
                props.signatureTolerance())) {
            return WebhookVerification.invalid("signature mismatch or stale timestamp");
        }
        try {
            JsonNode payload = objectMapper.readTree(rawBody);
            String eventId = text(payload, "id");
            if (eventId == null) return WebhookVerification.invalid("missing event id");
            return WebhookVerification.verified(eventId, payload.path("type").asString(""), payload, rawBody);
        } catch (JacksonException e) {
            return WebhookVerification.invalid("body is not JSON");
        }
    }

    @Override
    public List<PaymentEvent> parse(WebhookVerification verified) {
        JsonNode object = verified.payload().path("data").path("object");
        Instant at = Instant.ofEpochSecond(verified.payload().path("created").asLong(clock.instant().getEpochSecond()));
        return switch (verified.eventType()) {
            case "checkout.session.completed" -> "paid".equals(object.path("payment_status").asString(""))
                    ? List.of(sessionEvent(verified, PaymentEventType.PAYMENT_CAPTURED, object, at, null, null))
                    : List.of(); // async methods settle later via async_payment_succeeded
            case "checkout.session.async_payment_succeeded" ->
                    List.of(sessionEvent(verified, PaymentEventType.PAYMENT_CAPTURED, object, at, null, null));
            case "checkout.session.async_payment_failed" -> List.of(sessionEvent(verified,
                    PaymentEventType.PAYMENT_FAILED, object, at, "async_payment_failed", "The payment did not complete"));
            case "checkout.session.expired" -> List.of(sessionEvent(verified, PaymentEventType.PAYMENT_FAILED, object,
                    at, "checkout_expired", "The checkout expired before payment"));
            case "refund.updated" -> switch (object.path("status").asString("")) {
                case "succeeded" -> List.of(refundEvent(verified, PaymentEventType.REFUND_PROCESSED, object, at, null));
                case "failed", "canceled" -> List.of(refundEvent(verified, PaymentEventType.REFUND_FAILED, object, at,
                        "The provider could not process the refund"));
                default -> List.of();
            };
            default -> List.of();
        };
    }

    @Override
    public PaymentSnapshot fetch(Payment payment) {
        JsonNode session = call("fetch session", () -> client.get()
                .uri("/v1/checkout/sessions/{id}", payment.getProviderOrderId()).retrieve().body(JsonNode.class));
        if ("paid".equals(session.path("payment_status").asString(""))) {
            return new PaymentSnapshot(true, PaymentStatus.CAPTURED, text(session, "payment_intent"),
                    session.path("amount_total").asLong(-1), upper(text(session, "currency")));
        }
        if ("expired".equals(session.path("status").asString(""))) {
            return new PaymentSnapshot(true, PaymentStatus.FAILED, text(session, "payment_intent"),
                    session.path("amount_total").asLong(-1), upper(text(session, "currency")));
        }
        return PaymentSnapshot.unknown();
    }

    @Override
    public RefundResult refund(Payment payment, long amountMinor, String reason) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("payment_intent", payment.getProviderPaymentId());
        form.add("amount", Long.toString(amountMinor));
        if (reason != null) form.add("metadata[reason]", reason);
        JsonNode refund = call("refund " + payment.getProviderPaymentId(), () -> client.post().uri("/v1/refunds")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class));
        String id = text(refund, "id");
        if (id == null) return new RefundResult(false, null, false, "Stripe returned no refund id");
        String status = refund.path("status").asString("");
        if ("failed".equals(status) || "canceled".equals(status)) {
            return new RefundResult(false, id, false, "Stripe refund " + status);
        }
        return new RefundResult(true, id, "succeeded".equals(status), null);
    }

    private static PaymentEvent sessionEvent(WebhookVerification verified, PaymentEventType type, JsonNode session,
                                             Instant at, String errorCode, String errorMessage) {
        JsonNode methods = session.path("payment_method_types");
        String method = methods.isArray() && !methods.isEmpty() ? methods.get(0).asString() : null;
        return new PaymentEvent(verified.providerEventId(), type, text(session, "id"), text(session, "payment_intent"),
                session.path("amount_total").asLong(-1), upper(text(session, "currency")), method, errorCode,
                errorMessage, at, null);
    }

    private static PaymentEvent refundEvent(WebhookVerification verified, PaymentEventType type, JsonNode refund,
                                            Instant at, String errorMessage) {
        return new PaymentEvent(verified.providerEventId(), type, null, text(refund, "payment_intent"),
                refund.path("amount").asLong(-1), upper(text(refund, "currency")), null, null, errorMessage, at,
                text(refund, "id"));
    }

    private static String expand(String template, Order order) {
        return template.replace("{courseId}", order.getCourseId()).replace("{orderId}", order.getId().toString());
    }

    private <T> T call(String what, Supplier<T> request) {
        try {
            T result = request.get();
            if (result == null) throw ApiException.providerPermanent("Stripe returned an empty response", null);
            return result;
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().is5xxServerError() || e.getStatusCode().value() == 429) {
                throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
            }
            log.error("Stripe rejected {}: {} {}", what, e.getStatusCode(), e.getResponseBodyAsString());
            throw ApiException.providerPermanent("The payment provider rejected the request", e);
        } catch (ResourceAccessException e) {
            throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
        }
    }

    private static String upper(String value) {
        return value == null ? null : value.toUpperCase(Locale.ROOT);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    private static void require(String value, String key) {
        if (value == null || value.isBlank()) throw new IllegalStateException(key + " must be set when Stripe is enabled");
    }
}
