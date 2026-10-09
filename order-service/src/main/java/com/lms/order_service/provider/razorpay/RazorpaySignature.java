package com.lms.order_service.provider.razorpay;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;

/** X-Razorpay-Signature: hex HMAC-SHA256 of the raw webhook body, keyed by the webhook secret. */
final class RazorpaySignature {

    private RazorpaySignature() {
    }

    static String sign(String secret, String rawBody) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    static boolean matches(String secret, String rawBody, String presented) {
        if (presented == null) return false;
        return MessageDigest.isEqual(sign(secret, rawBody).getBytes(StandardCharsets.US_ASCII),
                presented.trim().toLowerCase().getBytes(StandardCharsets.US_ASCII));
    }
}
