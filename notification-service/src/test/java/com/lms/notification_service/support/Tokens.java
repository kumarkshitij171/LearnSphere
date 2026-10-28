package com.lms.notification_service.support;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

/** Mints tokens shaped like backend's generateAccessToken, for tests only. */
public final class Tokens {

    public static final String SECRET = "test-access-secret";
    public static final String INTERNAL_KEY = "test-internal-key";

    private Tokens() {
    }

    public static String access(String userId, String role) {
        try {
            Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
            String header = b64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            String payload = b64.encodeToString(("{\"id\":\"%s\",\"email\":\"%s@x.com\",\"role\":\"%s\",\"exp\":%d}"
                    .formatted(userId, userId, role, Instant.now().plusSeconds(600).getEpochSecond()))
                    .getBytes(StandardCharsets.UTF_8));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return header + "." + payload + "." + b64.encodeToString(
                    mac.doFinal((header + "." + payload).getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
