package com.lms.notification_service.channel.push;

import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.Signature;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

/**
 * OAuth 2.0 for a service account (RFC 7523): a JWT signed RS256 with the account's key, exchanged
 * for a one-hour access token, cached until a minute before it expires.
 */
public class FcmAccessTokenProvider {

    static final String SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
    private static final long EARLY_REFRESH_SECONDS = 60;

    private final GoogleServiceAccount account;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    private String cachedToken;
    private Instant cachedUntil = Instant.EPOCH;

    public FcmAccessTokenProvider(GoogleServiceAccount account, RestClient restClient, ObjectMapper objectMapper, Clock clock) {
        this.account = account;
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public synchronized String accessToken() {
        Instant now = clock.instant();
        if (cachedToken != null && now.isBefore(cachedUntil)) return cachedToken;

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
        form.add("assertion", assertion(now));
        JsonNode response = restClient.post().uri(account.tokenUri())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(JsonNode.class);
        String token = response == null ? "" : response.path("access_token").asString("");
        if (token.isEmpty()) throw new IllegalStateException("Google returned no access_token");
        long expiresIn = response.path("expires_in").asLong(3600);
        cachedToken = token;
        cachedUntil = now.plusSeconds(Math.max(expiresIn - EARLY_REFRESH_SECONDS, 0));
        return token;
    }

    /** Forces the next call to fetch a new token, e.g. after FCM answers 401. */
    public synchronized void invalidate() {
        cachedToken = null;
        cachedUntil = Instant.EPOCH;
    }

    String assertion(Instant now) {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        String header = b64.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String claims = b64.encodeToString(objectMapper.writeValueAsBytes(java.util.Map.of(
                "iss", account.clientEmail(),
                "scope", SCOPE,
                "aud", account.tokenUri(),
                "iat", now.getEpochSecond(),
                "exp", now.plusSeconds(3600).getEpochSecond())));
        String signingInput = header + "." + claims;
        try {
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(account.privateKey());
            signer.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            return signingInput + "." + b64.encodeToString(signer.sign());
        } catch (Exception e) {
            throw new IllegalStateException("Could not sign the service-account assertion", e);
        }
    }
}
