package com.lms.order_service.provider.stripe;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Stripe-Signature: "t=<unix>,v1=<hex>[,v1=...]". The signed payload is "<t>.<raw body>", HMAC-SHA256
 * with the endpoint secret. The timestamp is checked against a tolerance so a captured request
 * cannot be replayed later.
 */
final class StripeSignature {

    private StripeSignature() {
    }

    static String sign(String secret, long timestamp, String rawBody) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(
                    mac.doFinal((timestamp + "." + rawBody).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    static boolean matches(String secret, String rawBody, String header, Instant now, Duration tolerance) {
        if (header == null) return false;
        Long timestamp = null;
        java.util.List<String> signatures = new java.util.ArrayList<>();
        for (String part : header.split(",")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length != 2) continue;
            if (kv[0].equals("t")) {
                try {
                    timestamp = Long.parseLong(kv[1]);
                } catch (NumberFormatException e) {
                    return false;
                }
            } else if (kv[0].equals("v1")) {
                signatures.add(kv[1]);
            }
        }
        if (timestamp == null || signatures.isEmpty()) return false;
        if (Math.abs(now.getEpochSecond() - timestamp) > tolerance.toSeconds()) return false;

        byte[] expected = sign(secret, timestamp, rawBody).getBytes(StandardCharsets.US_ASCII);
        for (String signature : signatures) {
            if (MessageDigest.isEqual(expected, signature.getBytes(StandardCharsets.US_ASCII))) return true;
        }
        return false;
    }
}
