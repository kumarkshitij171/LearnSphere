package com.lms.notification_service.channel;

import com.lms.notification_service.channel.push.FcmAccessTokenProvider;
import com.lms.notification_service.channel.push.FcmClient;
import com.lms.notification_service.channel.push.GoogleServiceAccount;
import com.lms.notification_service.channel.push.PushSender;
import com.lms.notification_service.config.PushProperties;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.DeviceToken;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import com.lms.notification_service.repository.DeviceTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** FCM HTTP v1 and Google's OAuth token endpoint, mocked at the HTTP layer. */
class PushSenderTest {

    private static final String TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String SEND_URI = "https://fcm.googleapis.com/v1/projects/learnsphere-test/messages:send";
    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");

    private final JsonMapper json = JsonMapper.builder().build();
    private final DeviceTokenRepository devices = mock(DeviceTokenRepository.class);
    private KeyPair keys;
    private MockRestServiceServer server;
    private PushSender sender;
    private FcmAccessTokenProvider tokens;

    @BeforeEach
    void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(keys.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
        String serviceAccount = json.writeValueAsString(Map.of("type", "service_account", "project_id", "learnsphere-test",
                "client_email", "push@learnsphere-test.iam.gserviceaccount.com", "private_key", pem, "token_uri", TOKEN_URI));
        GoogleServiceAccount account = GoogleServiceAccount.parse(serviceAccount, json);

        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient http = builder.build();
        tokens = new FcmAccessTokenProvider(account, http, json, Clock.fixed(NOW, ZoneOffset.UTC));
        PushProperties props = new PushProperties(true, "/unused", "https://fcm.googleapis.com", "https://app.learnsphere.dev", Duration.ofSeconds(5));
        sender = new PushSender(new FcmClient(http, tokens, json, props.fcmBaseUrl(), account.projectId()), devices, props);
    }

    private static Notification notification() {
        Notification n = new Notification();
        n.setNotificationId("o1:receipt");
        n.setTenantId("learnsphere");
        n.setUserId("u1");
        n.setTemplateName("order-receipt");
        n.setVariables(Map.of("link", "/courses/c1"));
        return n;
    }

    private static DeviceToken device(String token) {
        DeviceToken d = new DeviceToken();
        d.setToken(token);
        d.setUserId("u1");
        d.setActive(true);
        return d;
    }

    private void expectToken() {
        server.expect(once(), requestTo(TOKEN_URI)).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"access_token\":\"ya29.test\",\"expires_in\":3600,\"token_type\":\"Bearer\"}",
                        MediaType.APPLICATION_JSON));
    }

    private final RenderedContent content = new RenderedContent("You're in — Kafka", "Payment received.");

    @Test
    void signsAValidServiceAccountAssertionAndSendsWithTheAccessToken() throws Exception {
        AtomicReference<String> form = new AtomicReference<>();
        AtomicReference<String> sent = new AtomicReference<>();
        server.expect(once(), requestTo(TOKEN_URI)).andExpect(req -> form.set(((org.springframework.mock.http.client.MockClientHttpRequest) req).getBodyAsString()))
                .andRespond(withSuccess("{\"access_token\":\"ya29.test\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(SEND_URI)).andExpect(header("Authorization", "Bearer ya29.test"))
                .andExpect(req -> sent.set(((org.springframework.mock.http.client.MockClientHttpRequest) req).getBodyAsString()))
                .andRespond(withSuccess("{\"name\":\"projects/learnsphere-test/messages/0:1\"}", MediaType.APPLICATION_JSON));

        SendResult result = sender.send(notification(), new NotificationTarget(null, null, List.of("fcm-1")), content);

        assertThat(result.success()).isTrue();
        assertThat(result.providerMessageId()).isEqualTo("projects/learnsphere-test/messages/0:1");
        server.verify();

        // the JWT assertion is RS256 over the documented claims, verifiable with the public key
        String assertion = URLDecoder.decode(form.get().split("assertion=")[1].split("&")[0], StandardCharsets.UTF_8);
        assertThat(form.get()).contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
        String[] parts = assertion.split("\\.");
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keys.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
        JsonNode claims = json.readTree(Base64.getUrlDecoder().decode(parts[1]));
        assertThat(claims.path("iss").asString()).isEqualTo("push@learnsphere-test.iam.gserviceaccount.com");
        assertThat(claims.path("aud").asString()).isEqualTo(TOKEN_URI);
        assertThat(claims.path("scope").asString()).isEqualTo("https://www.googleapis.com/auth/firebase.messaging");
        assertThat(claims.path("exp").asLong() - claims.path("iat").asLong()).isEqualTo(3600);

        // the message: token, title/body, data, and an absolute https click-through
        JsonNode message = json.readTree(sent.get()).path("message");
        assertThat(message.path("token").asString()).isEqualTo("fcm-1");
        assertThat(message.path("notification").path("title").asString()).isEqualTo("You're in — Kafka");
        assertThat(message.path("data").path("notificationId").asString()).isEqualTo("o1:receipt");
        assertThat(message.path("webpush").path("fcm_options").path("link").asString()).isEqualTo("https://app.learnsphere.dev/courses/c1");
    }

    @Test
    void reusesTheCachedAccessTokenAcrossSends() {
        expectToken();
        server.expect(times(2), requestTo(SEND_URI)).andRespond(withSuccess("{\"name\":\"m\"}", MediaType.APPLICATION_JSON));
        sender.send(notification(), new NotificationTarget(null, null, List.of("a")), content);
        sender.send(notification(), new NotificationTarget(null, null, List.of("b")), content);
        server.verify();
    }

    @Test
    void fallsBackToTheUsersRegisteredDevicesAndDeactivatesUnregisteredTokens() {
        DeviceToken stale = device("stale");
        when(devices.findByTenantIdAndUserIdAndActiveIsTrue("learnsphere", "u1")).thenReturn(List.of(device("good"), stale));
        when(devices.findByToken("stale")).thenReturn(Optional.of(stale));
        expectToken();
        server.expect(once(), requestTo(SEND_URI)).andRespond(withSuccess("{\"name\":\"m1\"}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(SEND_URI)).andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":{\"code\":404,\"status\":\"NOT_FOUND\",\"message\":\"Requested entity was not found.\","
                        + "\"details\":[{\"@type\":\"type.googleapis.com/google.firebase.fcm.v1.FcmError\",\"errorCode\":\"UNREGISTERED\"}]}}"));

        SendResult result = sender.send(notification(), new NotificationTarget(null, null, null), content);

        assertThat(result.success()).isTrue();
        assertThat(result.providerMessageId()).isEqualTo("m1 (1 of 2 devices)");
        assertThat(stale.isActive()).isFalse();
        verify(devices).save(stale);
    }

    @Test
    void aUserWithNoDevicesIsSkippedNotFailed() {
        when(devices.findByTenantIdAndUserIdAndActiveIsTrue("learnsphere", "u1")).thenReturn(List.of());
        SendResult result = sender.send(notification(), new NotificationTarget(null, null, null), content);
        assertThat(result.skipped()).isTrue();
        assertThat(result.success()).isFalse();
        server.verify(); // no HTTP at all
    }

    @Test
    void anFcmOutageIsTransient() {
        expectToken();
        server.expect(once(), requestTo(SEND_URI)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"status\":\"UNAVAILABLE\"}}"));
        assertThat(sender.send(notification(), new NotificationTarget(null, null, List.of("t")), content).errorType())
                .isEqualTo(ErrorType.TRANSIENT);
    }

    @Test
    void aBadPayloadIsPermanentAndKeepsTheToken() {
        expectToken();
        server.expect(once(), requestTo(SEND_URI)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"status\":\"INVALID_ARGUMENT\",\"message\":\"Invalid JSON payload\"}}"));
        assertThat(sender.send(notification(), new NotificationTarget(null, null, List.of("t")), content).errorType())
                .isEqualTo(ErrorType.PERMANENT);
        verify(devices, never()).save(any());
    }

    @Test
    void rejectedServiceAccountCredentialsArePermanent() {
        server.expect(once(), requestTo(TOKEN_URI)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":\"invalid_grant\"}"));
        SendResult result = sender.send(notification(), new NotificationTarget(null, null, List.of("t")), content);
        assertThat(result.errorType()).isEqualTo(ErrorType.PERMANENT);
        assertThat(result.errorMessage()).contains("OAuth");
    }

    @Test
    void anExpiredAccessTokenIsDroppedAfterA401() {
        expectToken();
        server.expect(once(), requestTo(SEND_URI)).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"status\":\"UNAUTHENTICATED\"}}"));
        expectToken();
        server.expect(once(), requestTo(SEND_URI)).andRespond(withSuccess("{\"name\":\"m\"}", MediaType.APPLICATION_JSON));
        sender.send(notification(), new NotificationTarget(null, null, List.of("t")), content);
        assertThat(sender.send(notification(), new NotificationTarget(null, null, List.of("t")), content).success()).isTrue();
        server.verify();
    }
}
