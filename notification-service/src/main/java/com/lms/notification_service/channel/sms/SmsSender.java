package com.lms.notification_service.channel.sms;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.config.SmsProperties;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * SMS through Twilio's REST API. The template's body is the message text. Registered by SmsConfig
 * only when lms.notification.sms.enabled=true — the third and last step of adding a channel.
 */
public class SmsSender implements ChannelSender {

    static final String PROVIDER = "twilio";
    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{6,14}$");
    // https://www.twilio.com/docs/api/errors — retrying any of these sends the same failure again
    private static final Set<Integer> PERMANENT_CODES = Set.of(20003, 21211, 21212, 21408, 21606, 21608, 21610, 21612, 21614);

    private final RestClient restClient;
    private final SmsProperties props;
    private final ObjectMapper objectMapper;
    private final String messagesUrl;
    private final String authorization;

    public SmsSender(RestClient restClient, SmsProperties props, ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.props = props;
        this.objectMapper = objectMapper;
        this.messagesUrl = props.baseUrl().replaceAll("/$", "") + "/2010-04-01/Accounts/" + props.accountSid() + "/Messages.json";
        this.authorization = "Basic " + Base64.getEncoder()
                .encodeToString((props.accountSid() + ":" + props.authToken()).getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public ChannelType channel() {
        return ChannelType.SMS;
    }

    @Override
    public String resolveTarget(NotificationTarget target) {
        return target == null ? null : target.phone();
    }

    @Override
    public SendResult send(Notification notification, NotificationTarget target, RenderedContent content) {
        String to = resolveTarget(target);
        if (to == null || !E164.matcher(to).matches()) {
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, "target.phone must be an E.164 number, e.g. +919876543210");
        }
        if (content.body() == null || content.body().isBlank()) {
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, "the SMS template rendered an empty body");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("To", to);
        form.add(props.from().startsWith("MG") ? "MessagingServiceSid" : "From", props.from());
        form.add("Body", content.body());
        try {
            JsonNode response = restClient.post().uri(messagesUrl)
                    .header("Authorization", authorization)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
            return SendResult.sent(PROVIDER, response == null ? null : response.path("sid").asString(null));
        } catch (RestClientResponseException e) {
            return classify(e.getStatusCode().value(), e.getResponseBodyAsString());
        } catch (ResourceAccessException e) {
            return SendResult.failed(PROVIDER, ErrorType.TRANSIENT, "Twilio unreachable: " + e.getMessage());
        }
    }

    SendResult classify(int status, String body) {
        int code = 0;
        String message = "";
        try {
            JsonNode error = objectMapper.readTree(body);
            code = error.path("code").asInt(0);
            message = error.path("message").asString("");
        } catch (RuntimeException ignored) {
            // non-JSON body
        }
        String detail = "Twilio %d%s%s".formatted(status, code == 0 ? "" : " (" + code + ")", message.isEmpty() ? "" : ": " + message);
        if (status == 429 || status >= 500) return SendResult.failed(PROVIDER, ErrorType.TRANSIENT, detail);
        if (status == 401 || PERMANENT_CODES.contains(code) || status == 400 || status == 404) {
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, detail);
        }
        return SendResult.failed(PROVIDER, ErrorType.TRANSIENT, detail);
    }
}
