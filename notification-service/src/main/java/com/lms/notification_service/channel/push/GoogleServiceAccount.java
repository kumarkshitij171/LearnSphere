package com.lms.notification_service.channel.push;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;

/** The fields of a Google service-account key file this service needs. */
public record GoogleServiceAccount(String projectId, String clientEmail, PrivateKey privateKey, String tokenUri) {

    static final String DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

    public static GoogleServiceAccount parse(String json, ObjectMapper objectMapper) {
        JsonNode node = objectMapper.readTree(json);
        String projectId = node.path("project_id").asString("");
        String clientEmail = node.path("client_email").asString("");
        String pem = node.path("private_key").asString("");
        if (projectId.isEmpty() || clientEmail.isEmpty() || pem.isEmpty()) {
            throw new IllegalStateException("Service-account JSON must contain project_id, client_email and private_key");
        }
        String tokenUri = node.path("token_uri").asString(DEFAULT_TOKEN_URI);
        return new GoogleServiceAccount(projectId, clientEmail, rsaKey(pem), tokenUri.isEmpty() ? DEFAULT_TOKEN_URI : tokenUri);
    }

    private static PrivateKey rsaKey(String pem) {
        String base64 = pem.replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        try {
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
        } catch (Exception e) {
            throw new IllegalStateException("Service-account private_key is not a PKCS#8 RSA key", e);
        }
    }
}
