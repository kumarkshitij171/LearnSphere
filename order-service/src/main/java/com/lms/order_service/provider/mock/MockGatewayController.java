package com.lms.order_service.provider.mock;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.repository.PaymentRepository;
import com.lms.order_service.service.WebhookOutcome;
import com.lms.order_service.service.WebhookService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Dev stand-in for the gateway: completes a mock checkout by sending a signed webhook through the
 * real webhook pipeline. Exists only while lms.payment.mock.enabled=true, never in prod.
 */
@RestController
@RequestMapping("/api/v1/mock-gateway")
@ConditionalOnProperty(name = "lms.payment.mock.enabled", havingValue = "true")
@RequiredArgsConstructor
public class MockGatewayController {

    public record SimulateRequest(Long amountMinor, String errorCode) {
    }

    private final PaymentRepository paymentRepository;
    private final WebhookService webhookService;
    private final MockPaymentProvider mockProvider;
    private final ObjectMapper objectMapper;

    /** outcome: capture | fail. amountMinor overrides the captured amount, to exercise the mismatch guard. */
    @PostMapping("/orders/{providerOrderId}/{outcome}")
    public ResponseEntity<Map<String, Object>> simulate(@PathVariable String providerOrderId,
                                                        @PathVariable String outcome,
                                                        @RequestBody(required = false) SimulateRequest request) {
        boolean capture = switch (outcome) {
            case "capture" -> true;
            case "fail" -> false;
            default -> throw ApiException.validation("outcome must be capture or fail");
        };
        Payment payment = paymentRepository
                .findFirstByProviderAndProviderOrderIdOrderByCreatedAtDesc(PaymentProviderType.MOCK, providerOrderId)
                .orElseThrow(() -> ApiException.notFound("No mock checkout " + providerOrderId));

        long amount = request != null && request.amountMinor() != null ? request.amountMinor() : payment.getAmountMinor();
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("id", "mock_pay_" + UUID.randomUUID().toString().replace("-", ""));
        entity.put("order_id", providerOrderId);
        entity.put("amount", amount);
        entity.put("currency", payment.getCurrency());
        entity.put("method", "upi");
        entity.put("status", capture ? "captured" : "failed");
        entity.put("error_code", capture ? null : (request != null && request.errorCode() != null
                ? request.errorCode() : "BAD_REQUEST_ERROR"));
        entity.put("error_description", capture ? null : "Payment declined by the mock gateway");

        String rawBody = objectMapper.writeValueAsString(Map.of(
                "event", capture ? MockPaymentProvider.EVENT_CAPTURED : MockPaymentProvider.EVENT_FAILED,
                "created_at", Instant.now().getEpochSecond(),
                "payload", Map.of("payment", Map.of("entity", entity))));
        String eventId = "mock_evt_" + UUID.randomUUID().toString().replace("-", "");

        WebhookOutcome result = webhookService.handle(PaymentProviderType.MOCK, rawBody, Map.of(
                MockWebhookSignature.SIGNATURE_HEADER, MockWebhookSignature.sign(mockProvider.webhookSecret(), rawBody),
                MockWebhookSignature.EVENT_ID_HEADER, eventId), "mock-gateway");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventId", eventId);
        body.put("webhookStatus", result.status());
        body.put("detail", result.detail());
        return ResponseEntity.status(result.httpStatus()).body(body);
    }
}
