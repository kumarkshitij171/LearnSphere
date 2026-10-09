package com.lms.notification_service.security;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class AccessTokenVerifierTest {

    private static final String SECRET = "access_token";
    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final AccessTokenVerifier verifier =
            new AccessTokenVerifier(SECRET, JsonMapper.builder().build(), Clock.fixed(NOW, ZoneOffset.UTC));

    // the payload backend's generateAccessToken signs: { id, email, role } plus iat/exp
    private static String payload(long exp) {
        return "{\"id\":\"clx123\",\"email\":\"student@example.com\",\"role\":\"STUDENT\",\"iat\":%d,\"exp\":%d}"
                .formatted(NOW.getEpochSecond() - 60, exp);
    }

    private static String token(String headerJson, String payloadJson, String secret) throws Exception {
        String signingInput = B64.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8)) + "."
                + B64.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return signingInput + "." + B64.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII)));
    }

    private static final String HS256 = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";

    @Test
    void acceptsAValidBackendToken() throws Exception {
        var claims = verifier.verify(token(HS256, payload(NOW.getEpochSecond() + 300), SECRET));
        assertThat(claims).isPresent();
        assertThat(claims.get().userId()).isEqualTo("clx123");
        assertThat(claims.get().email()).isEqualTo("student@example.com");
        assertThat(claims.get().role()).isEqualTo("STUDENT");
    }

    @Test
    void rejectsAWrongSecret() throws Exception {
        assertThat(verifier.verify(token(HS256, payload(NOW.getEpochSecond() + 300), "other"))).isEmpty();
    }

    @Test
    void rejectsATamperedPayload() throws Exception {
        String[] parts = token(HS256, payload(NOW.getEpochSecond() + 300), SECRET).split("\\.");
        String forged = B64.encodeToString(payload(NOW.getEpochSecond() + 300).replace("STUDENT", "ADMIN")
                .getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(parts[0] + "." + forged + "." + parts[2])).isEmpty();
    }

    @Test
    void rejectsAlgNoneAndOtherAlgorithms() throws Exception {
        String body = payload(NOW.getEpochSecond() + 300);
        String unsigned = B64.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
                + B64.encodeToString(body.getBytes(StandardCharsets.UTF_8)) + ".";
        assertThat(verifier.verify(unsigned)).isEmpty();
        assertThat(verifier.verify(token("{\"alg\":\"HS512\"}", body, SECRET))).isEmpty();
    }

    @Test
    void rejectsExpiredAndMissingExpiry() throws Exception {
        assertThat(verifier.verify(token(HS256, payload(NOW.getEpochSecond() - 60), SECRET))).isEmpty();
        assertThat(verifier.verify(token(HS256, "{\"id\":\"clx123\"}", SECRET))).isEmpty();
    }

    @Test
    void rejectsATokenWithoutAUserId() throws Exception {
        assertThat(verifier.verify(token(HS256, "{\"exp\":%d}".formatted(NOW.getEpochSecond() + 300), SECRET)))
                .isEmpty();
    }

    @Test
    void rejectsGarbage() {
        assertThat(verifier.verify(null)).isEmpty();
        assertThat(verifier.verify("")).isEmpty();
        assertThat(verifier.verify("a.b")).isEmpty();
        assertThat(verifier.verify("!!.@@.##")).isEmpty();
    }
}
