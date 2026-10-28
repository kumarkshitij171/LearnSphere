package com.lms.notification_service.channel;

import com.lms.notification_service.channel.inapp.InAppSender;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class InAppSenderTest {

    private final InAppSender sender = new InAppSender();
    private final RenderedContent content = new RenderedContent("You're in — Kafka 101", "Payment of ₹499.00 received.");

    private static Notification row(String userId, Map<String, String> variables) {
        Notification n = new Notification();
        n.setNotificationId("o1:receipt");
        n.setTenantId("learnsphere");
        n.setUserId(userId);
        n.setChannel(ChannelType.IN_APP);
        n.setVariables(variables);
        return n;
    }

    @Test
    void deliversByFillingInTheInboxEntry() {
        Notification n = row("u1", Map.of("link", "/courses/c1"));
        SendResult result = sender.send(n, null, content);

        assertThat(result.success()).isTrue();
        assertThat(result.provider()).isEqualTo("inbox");
        assertThat(n.getTitle()).isEqualTo("You're in — Kafka 101");
        assertThat(n.getBody()).isEqualTo("Payment of ₹499.00 received.");
        assertThat(n.getLink()).isEqualTo("/courses/c1");
        assertThat(n.getReadAt()).isNull();
        assertThat(sender.channel()).isEqualTo(ChannelType.IN_APP);
        assertThat(sender.resolveTarget(null)).isEqualTo("inbox");
    }

    @Test
    void theLinkIsOptional() {
        Notification noVariables = row("u1", null);
        assertThat(sender.send(noVariables, null, content).success()).isTrue();
        assertThat(noVariables.getLink()).isNull();

        Map<String, String> blank = new HashMap<>();
        blank.put("link", null);
        Notification nullLink = row("u1", blank);
        assertThat(sender.send(nullLink, null, content).success()).isTrue();
        assertThat(nullLink.getLink()).isNull();
    }

    @Test
    void onlyInAppPathsAndHttpLinksAreKept() {
        assertThat(link("https://learnsphere.dev/x")).isEqualTo("https://learnsphere.dev/x");
        assertThat(link("http://localhost:3000/orders")).isEqualTo("http://localhost:3000/orders");
        assertThat(link("  /orders  ")).isEqualTo("/orders");
        // the app renders it as an href
        assertThat(link("javascript:alert(1)")).isNull();
        assertThat(link("//evil.example/phish")).isNull();
        assertThat(link("/\\evil.example")).isNull();
        assertThat(link("data:text/html,hi")).isNull();
        assertThat(link("   ")).isNull();
    }

    @Test
    void aMessageWithNoUserCannotReachAnInboxAndIsNotRetried() {
        SendResult result = sender.send(row(null, Map.of()), null, content);
        assertThat(result.success()).isFalse();
        assertThat(result.errorType()).isEqualTo(ErrorType.PERMANENT);
    }

    private String link(String raw) {
        Notification n = row("u1", Map.of("link", raw));
        sender.send(n, null, content);
        return n.getLink();
    }
}
