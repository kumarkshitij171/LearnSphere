package com.lms.notification_service.channel;

import com.lms.notification_service.channel.sms.SmsSender;
import com.lms.notification_service.config.SmsProperties;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SmsSenderTest {

    private static final String URL = "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json";
    private MockRestServiceServer server;
    private SmsSender sender;
    private final RenderedContent content = new RenderedContent(null, "Your LearnSphere code is 4821");

    private SmsSender build(String from) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        return new SmsSender(builder.build(),
                new SmsProperties(true, "AC123", "secret", from, "https://api.twilio.com", Duration.ofSeconds(5)),
                JsonMapper.builder().build());
    }

    @BeforeEach
    void setUp() {
        sender = build("+15005550006");
    }

    private static NotificationTarget phone(String number) {
        return new NotificationTarget(null, number, null);
    }

    @Test
    void sendsTheBodyWithBasicAuthAndReturnsTheMessageSid() {
        AtomicReference<String> form = new AtomicReference<>();
        String auth = "Basic " + Base64.getEncoder().encodeToString("AC123:secret".getBytes(StandardCharsets.UTF_8));
        server.expect(once(), requestTo(URL)).andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", auth))
                .andExpect(req -> form.set(((MockClientHttpRequest) req).getBodyAsString()))
                .andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"sid\":\"SM0123\",\"status\":\"queued\"}"));
        SendResult result = sender.send(new Notification(), phone("+919876543210"), content);
        assertThat(result.success()).isTrue();
        assertThat(result.providerMessageId()).isEqualTo("SM0123");
        assertThat(form.get()).contains("To=%2B919876543210").contains("From=%2B15005550006")
                .contains("Body=Your+LearnSphere+code+is+4821");
    }

    @Test
    void aMessagingServiceSidIsSentAsMessagingServiceSid() {
        sender = build("MG999");
        AtomicReference<String> form = new AtomicReference<>();
        server.expect(once(), requestTo(URL)).andExpect(req -> form.set(((MockClientHttpRequest) req).getBodyAsString()))
                .andRespond(withSuccess("{\"sid\":\"SM1\"}", MediaType.APPLICATION_JSON));
        sender.send(new Notification(), phone("+919876543210"), content);
        assertThat(form.get()).contains("MessagingServiceSid=MG999").doesNotContain("From=");
    }

    @Test
    void aMissingOrMalformedNumberIsPermanentWithoutCallingTwilio() {
        assertThat(sender.send(new Notification(), phone(null), content).errorType()).isEqualTo(ErrorType.PERMANENT);
        assertThat(sender.send(new Notification(), phone("98765 43210"), content).errorType()).isEqualTo(ErrorType.PERMANENT);
        server.verify();
    }

    @Test
    void anInvalidRecipientIsPermanent() {
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                .body("{\"code\":21211,\"message\":\"The 'To' number is not a valid phone number.\",\"status\":400}"));
        SendResult result = sender.send(new Notification(), phone("+10000000000"), content);
        assertThat(result.errorType()).isEqualTo(ErrorType.PERMANENT);
        assertThat(result.errorMessage()).contains("21211");
    }

    @Test
    void throttlingAndOutagesAreTransient() {
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .contentType(MediaType.APPLICATION_JSON).body("{\"code\":20429,\"message\":\"Too Many Requests\"}"));
        assertThat(sender.send(new Notification(), phone("+919876543210"), content).errorType()).isEqualTo(ErrorType.TRANSIENT);
    }

    @Test
    void badCredentialsArePermanent() {
        server.expect(once(), requestTo(URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON).body("{\"code\":20003,\"message\":\"Authenticate\"}"));
        assertThat(sender.send(new Notification(), phone("+919876543210"), content).errorType()).isEqualTo(ErrorType.PERMANENT);
    }
}
