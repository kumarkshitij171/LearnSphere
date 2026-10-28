package com.lms.order_service.filters;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.Optional;

/**
 * Verifies the HS256 access token backend issues ({ id, email, role }). Verify-only: this service
 * must never mint tokens. The algorithm is pinned, so "none" and alg-confusion tokens are rejected.
 */
public class AccessTokenVerifier {

    private static final String HMAC = "HmacSHA256";
    private static final long CLOCK_SKEW_SECONDS = 5;

    private final byte[] secret;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public record Claims(String userId, String email, String name, String role) {
    }

    public AccessTokenVerifier(String secret, ObjectMapper objectMapper, Clock clock) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public Optional<Claims> verify(String token) {
        if (token == null) return Optional.empty();
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) return Optional.empty();
        try {
            JsonNode header = decode(parts[0]);
            if (!"HS256".equals(text(header, "alg"))) return Optional.empty();

            byte[] expected = sign(parts[0] + "." + parts[1]);
            byte[] actual = Base64.getUrlDecoder().decode(parts[2]);
            if (!MessageDigest.isEqual(expected, actual)) return Optional.empty();

            JsonNode payload = decode(parts[1]);
            long now = clock.instant().getEpochSecond();
            JsonNode exp = payload.get("exp");
            if (exp == null || !exp.isNumber() || exp.asLong() + CLOCK_SKEW_SECONDS < now) return Optional.empty();
            JsonNode nbf = payload.get("nbf");
            if (nbf != null && nbf.isNumber() && nbf.asLong() - CLOCK_SKEW_SECONDS > now) return Optional.empty();

            String userId = text(payload, "id");
            if (userId == null || userId.isBlank()) return Optional.empty();
            return Optional.of(new Claims(userId, text(payload, "email"), text(payload, "name"), text(payload, "role")));
        } catch (IllegalArgumentException | GeneralSecurityException | tools.jackson.core.JacksonException e) {
            return Optional.empty();
        }
    }

    private JsonNode decode(String segment) {
        return objectMapper.readTree(Base64.getUrlDecoder().decode(segment));
    }

    private byte[] sign(String signingInput) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(HMAC);
        mac.init(new SecretKeySpec(secret, HMAC));
        return mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII));
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isString() ? value.asString() : null;
    }
}
