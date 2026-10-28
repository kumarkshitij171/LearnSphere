package com.lms.notification_service.channel.push;

import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/** One FCM HTTP v1 `messages:send` call per device token, with its outcome classified. */
public class FcmClient {

    public enum Outcome { DELIVERED, TOKEN_INVALID, TRANSIENT, PERMANENT }

    public record Result(Outcome outcome, String messageName, String detail) {
    }

    private final RestClient restClient;
    private final FcmAccessTokenProvider tokens;
    private final ObjectMapper objectMapper;
    private final String sendUrl;

    public FcmClient(RestClient restClient, FcmAccessTokenProvider tokens, ObjectMapper objectMapper, String fcmBaseUrl,
                     String projectId) {
        this.restClient = restClient;
        this.tokens = tokens;
        this.objectMapper = objectMapper;
        this.sendUrl = fcmBaseUrl.replaceAll("/$", "") + "/v1/projects/" + projectId + "/messages:send";
    }

    public Result send(String deviceToken, String title, String body, Map<String, String> data, String link) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("token", deviceToken);
        message.put("notification", Map.of("title", title == null ? "" : title, "body", body == null ? "" : body));
        if (data != null && !data.isEmpty()) message.put("data", data);
        if (link != null) message.put("webpush", Map.of("fcm_options", Map.of("link", link)));

        String accessToken;
        try {
            accessToken = tokens.accessToken();
        } catch (RestClientResponseException e) {
            // invalid_grant / unauthorized_client: the service-account key is wrong or revoked
            return new Result(e.getStatusCode().is5xxServerError() ? Outcome.TRANSIENT : Outcome.PERMANENT, null,
                    "OAuth token exchange failed: " + e.getStatusCode());
        } catch (ResourceAccessException e) {
            return new Result(Outcome.TRANSIENT, null, "OAuth token endpoint unreachable");
        }

        try {
            JsonNode response = restClient.post().uri(sendUrl)
                    .header("Authorization", "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("message", message))
                    .retrieve()
                    .body(JsonNode.class);
            return new Result(Outcome.DELIVERED, response == null ? null : response.path("name").asString(null), null);
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 401) tokens.invalidate();
            return classify(e.getStatusCode().value(), e.getResponseBodyAsString());
        } catch (ResourceAccessException e) {
            return new Result(Outcome.TRANSIENT, null, "FCM unreachable: " + e.getMessage());
        }
    }

    // https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode
    Result classify(int status, String responseBody) {
        String errorCode = "";
        String message = "";
        try {
            JsonNode error = objectMapper.readTree(responseBody).path("error");
            message = error.path("message").asString("");
            for (JsonNode detail : error.path("details")) {
                String code = detail.path("errorCode").asString("");
                if (!code.isEmpty()) errorCode = code;
            }
            if (errorCode.isEmpty()) errorCode = error.path("status").asString("");
        } catch (RuntimeException ignored) {
            // a non-JSON error body: fall back to the status code alone
        }
        String detail = (errorCode.isEmpty() ? "HTTP " + status : errorCode) + (message.isEmpty() ? "" : ": " + message);
        if (errorCode.equals("UNREGISTERED") || errorCode.equals("SENDER_ID_MISMATCH")
                || (errorCode.equals("INVALID_ARGUMENT") && message.toLowerCase().contains("registration token"))) {
            return new Result(Outcome.TOKEN_INVALID, null, detail);
        }
        if (status == 429 || status >= 500 || errorCode.equals("UNAVAILABLE") || errorCode.equals("INTERNAL")
                || errorCode.equals("QUOTA_EXCEEDED")) {
            return new Result(Outcome.TRANSIENT, null, detail);
        }
        return new Result(Outcome.PERMANENT, null, detail);
    }
}
