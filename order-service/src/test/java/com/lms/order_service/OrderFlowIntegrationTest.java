package com.lms.order_service;

import com.lms.order_service.provider.mock.MockWebhookSignature;
import com.lms.order_service.repository.OrderEventRepository;
import com.lms.order_service.repository.OutboxRepository;
import com.lms.order_service.repository.WebhookEventRepository;
import com.lms.order_service.service.CatalogueClient;
import com.lms.order_service.service.CourseSnapshot;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.env.Environment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * The Phase 1 verification, automated: create → mock capture → PAID → one `order.paid` on Kafka,
 * against real Postgres and Kafka. The catalogue owner is the only thing stubbed.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "lms.auth.access-token-secret=" + OrderFlowIntegrationTest.SECRET,
        "lms.catalogue.internal-api-key=test-internal-key",
        "lms.payment.mock.enabled=true",
        "lms.order.outbox.poll-interval-ms=200"
})
class OrderFlowIntegrationTest {

    static final String SECRET = "integration-access-secret";
    private static final String MOCK_SECRET = "mock_webhook_secret";

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:15");

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer("apache/kafka:3.8.0");

    @MockitoBean
    CatalogueClient catalogueClient;

    @Autowired Environment environment;
    @Autowired ObjectMapper objectMapper;
    @Autowired WebhookEventRepository webhookEventRepository;
    @Autowired OrderEventRepository orderEventRepository;
    @Autowired OutboxRepository outboxRepository;

    private final HttpClient http = HttpClient.newHttpClient();
    private String userId;
    private String token;

    @BeforeEach
    void freshBuyer() throws Exception {
        userId = "user-" + UUID.randomUUID();
        token = accessToken(userId);
        when(catalogueClient.isEnrolled(anyString(), anyString())).thenReturn(false);
    }

    @Test
    void paidOrderEndToEnd() throws Exception {
        String courseId = course(49900);

        HttpResponse<String> created = createOrder(courseId, "key-1");
        assertThat(created.statusCode()).isEqualTo(201);
        JsonNode order = json(created);
        String orderId = order.get("orderId").asString();
        String providerOrderId = order.at("/checkout/providerOrderId").asString();
        assertThat(order.get("status").asString()).isEqualTo("PENDING");
        assertThat(order.get("amountMinor").asLong()).isEqualTo(49900);

        // same key → same order; new key, same live course → same order
        assertThat(json(createOrder(courseId, "key-1")).get("orderId").asString()).isEqualTo(orderId);
        HttpResponse<String> secondTab = createOrder(courseId, "key-2");
        assertThat(secondTab.statusCode()).isEqualTo(200);
        assertThat(json(secondTab).get("orderId").asString()).isEqualTo(orderId);

        // a forged webhook is rejected before anything is written
        long webhookRowsBefore = webhookEventRepository.count();
        String body = capturedBody(providerOrderId, 49900);
        assertThat(postWebhook(body, "evt-forged", "not-a-signature").statusCode()).isEqualTo(401);
        assertThat(webhookEventRepository.count()).isEqualTo(webhookRowsBefore);

        // genuine capture, then the provider redelivers the same event
        String eventId = "evt-" + UUID.randomUUID();
        String signature = MockWebhookSignature.sign(MOCK_SECRET, body);
        assertThat(json(postWebhook(body, eventId, signature)).get("status").asString()).isEqualTo("PROCESSED");
        HttpResponse<String> replay = postWebhook(body, eventId, signature);
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(json(replay).get("detail").asString()).isEqualTo("already processed");

        assertThat(json(get("/api/v1/orders/" + orderId)).get("status").asString()).isEqualTo("PAID");
        assertThat(orderEventRepository.findByOrderIdOrderByIdAsc(UUID.fromString(orderId)))
                .extracting(e -> e.getToStatus().name())
                .containsExactly("CREATED", "PENDING", "PAID");

        JsonNode paid = awaitOrderPaid(orderId);
        assertThat(paid.get("userId").asString()).isEqualTo(userId);
        assertThat(paid.get("courseId").asString()).isEqualTo(courseId);
        assertThat(paid.get("amountMinor").asLong()).isEqualTo(49900);
        assertThat(paid.get("currency").asString()).isEqualTo("INR");
        assertThat(paid.get("provider").asString()).isEqualTo("MOCK");
    }

    @Test
    void capturedAmountMismatchNeverMarksTheOrderPaid() throws Exception {
        String courseId = course(49900);
        JsonNode order = json(createOrder(courseId, "key-mismatch"));
        String body = capturedBody(order.at("/checkout/providerOrderId").asString(), 100);

        HttpResponse<String> response = postWebhook(body, "evt-" + UUID.randomUUID(),
                MockWebhookSignature.sign(MOCK_SECRET, body));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response).get("status").asString()).isEqualTo("FAILED");
        assertThat(json(get("/api/v1/orders/" + order.get("orderId").asString())).get("status").asString())
                .isEqualTo("PENDING");
    }

    @Test
    void freeCourseIsPaidWithoutAGateway() throws Exception {
        HttpResponse<String> created = createOrder(course(0), "key-free");
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(json(created).get("status").asString()).isEqualTo("PAID");
        assertThat(json(created).get("provider").asString()).isEqualTo("NONE");
        awaitOrderPaid(json(created).get("orderId").asString());
    }

    @Test
    void alreadyEnrolledIsAConflict() throws Exception {
        String courseId = course(49900);
        when(catalogueClient.isEnrolled(userId, courseId)).thenReturn(true);
        assertThat(createOrder(courseId, "key-owned").statusCode()).isEqualTo(409);
    }

    @Test
    void someoneElsesOrderIsNotFoundAndNoTokenIsUnauthorized() throws Exception {
        String orderId = json(createOrder(course(49900), "key-private")).get("orderId").asString();
        token = accessToken("someone-else");
        assertThat(get("/api/v1/orders/" + orderId).statusCode()).isEqualTo(404);
        token = null;
        assertThat(get("/api/v1/orders/" + orderId).statusCode()).isEqualTo(401);
    }

    @Test
    void adminFindsAnOrderByTheBuyersEmail() throws Exception {
        String orderId = json(createOrder(course(19900), "key-email")).get("orderId").asString();
        JsonNode mine = json(get("/api/v1/orders/" + orderId));
        assertThat(mine.get("userEmail").asString()).isEqualTo(userId + "@example.com");

        String buyer = userId;
        token = accessToken("admin-" + UUID.randomUUID(), "ADMIN");
        JsonNode found = json(get("/api/v1/admin/orders?email=" + buyer.toUpperCase().substring(0, 20)));
        assertThat(found.get("orders")).extracting(o -> o.get("orderId").asString()).contains(orderId);
        assertThat(json(get("/api/v1/admin/orders?email=nobody-like-this")).get("total").asLong()).isZero();
        // the unfiltered list (no email at all) is what the console opens with
        HttpResponse<String> all = get("/api/v1/admin/orders");
        assertThat(all.statusCode()).isEqualTo(200);
        assertThat(json(all).get("orders")).extracting(o -> o.get("orderId").asString()).contains(orderId);
        assertThat(get("/api/v1/admin/orders?status=PAID").statusCode()).isEqualTo(200);
    }

    @Test
    void missingIdempotencyKeyIsRejected() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/v1/orders"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"courseId\":\"c1\",\"provider\":\"MOCK\"}")));
        assertThat(response.statusCode()).isEqualTo(400);
    }

    private String course(long amountMinor) {
        String courseId = "course-" + UUID.randomUUID();
        when(catalogueClient.require(courseId)).thenReturn(
                new CourseSnapshot(courseId, "Kafka for Beginners", "INR", true, "instructor-1", amountMinor));
        return courseId;
    }

    private HttpResponse<String> createOrder(String courseId, String key) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("courseId", courseId, "provider", "MOCK",
                "idempotencyKey", key + "-" + userId));
        return send(HttpRequest.newBuilder(uri("/api/v1/orders"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    private HttpResponse<String> get(String path) throws Exception {
        return send(HttpRequest.newBuilder(uri(path)).GET());
    }

    private HttpResponse<String> postWebhook(String body, String eventId, String signature) throws Exception {
        return http.send(HttpRequest.newBuilder(uri("/api/v1/webhooks/mock"))
                .header("Content-Type", "application/json")
                .header("X-Mock-Event-Id", eventId)
                .header("X-Mock-Signature", signature)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        if (token != null) request.header("Authorization", "Bearer " + token);
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String capturedBody(String providerOrderId, long amountMinor) {
        Map<String, Object> entity = new java.util.LinkedHashMap<>();
        entity.put("id", "mock_pay_" + UUID.randomUUID());
        entity.put("order_id", providerOrderId);
        entity.put("amount", amountMinor);
        entity.put("currency", "INR");
        entity.put("method", "upi");
        entity.put("status", "captured");
        return objectMapper.writeValueAsString(Map.of("event", "payment.captured",
                "created_at", Instant.now().getEpochSecond(), "payload", Map.of("payment", Map.of("entity", entity))));
    }

    private JsonNode awaitOrderPaid(String orderId) throws Exception {
        Properties config = new Properties();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        config.put(ConsumerConfig.GROUP_ID_CONFIG, "test-" + UUID.randomUUID());
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of("order.paid"));
            Instant deadline = Instant.now().plusSeconds(20);
            while (Instant.now().isBefore(deadline)) {
                for (ConsumerRecord<String, String> record : consumer.poll(Duration.ofMillis(500))) {
                    JsonNode event = objectMapper.readTree(record.value());
                    if (orderId.equals(event.get("orderId").asString())) {
                        assertThat(record.key()).isEqualTo(userId);
                        return event;
                    }
                }
            }
        }
        throw new AssertionError("order.paid for " + orderId + " never arrived; unpublished outbox rows: "
                + outboxRepository.countByPublishedAtIsNull());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + environment.getProperty("local.server.port") + path);
    }

    private JsonNode json(HttpResponse<String> response) {
        return objectMapper.readTree(response.body());
    }

    private static String accessToken(String userId) throws Exception {
        return accessToken(userId, "STUDENT");
    }

    private static String accessToken(String userId, String role) throws Exception {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        String header = b64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = b64.encodeToString(("{\"id\":\"%s\",\"email\":\"%s@example.com\",\"role\":\"%s\",\"exp\":%d}"
                .formatted(userId, userId, role, Instant.now().plusSeconds(600).getEpochSecond())).getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return header + "." + payload + "." + b64.encodeToString(
                mac.doFinal((header + "." + payload).getBytes(StandardCharsets.US_ASCII)));
    }
}
