package com.lms.order_service.provider.mock;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Hex HMAC-SHA256 over the raw body: the same scheme Razorpay uses for X-Razorpay-Signature. */
public final class MockWebhookSignature {

    public static final String SIGNATURE_HEADER = "x-mock-signature";
    public static final String EVENT_ID_HEADER = "x-mock-event-id";

    private MockWebhookSignature() {
    }

    public static String sign(String secret, String rawBody) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    public static boolean matches(String secret, String rawBody, String presented) {
        if (presented == null) return false;
        byte[] expected = sign(secret, rawBody).getBytes(StandardCharsets.US_ASCII);
        byte[] actual = presented.trim().toLowerCase().getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual);
    }
}
