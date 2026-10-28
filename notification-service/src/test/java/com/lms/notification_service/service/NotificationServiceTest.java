package com.lms.notification_service.service;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.channel.ChannelSenderRegistry;
import com.lms.notification_service.channel.inapp.InAppSender;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.models.event.NotificationTarget;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.repository.TemplateRepository;
import com.lms.notification_service.support.InMemoryStore;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationServiceTest {

    private final NotificationRepository notifications = mock(NotificationRepository.class);
    private final DeadLetterRepository deadLetters = mock(DeadLetterRepository.class);
    private final TemplateRepository templates = mock(TemplateRepository.class);
    private final IdempotencyService idempotency = mock(IdempotencyService.class);
    private final RateLimitService rateLimits = mock(RateLimitService.class);
    private final ChannelSender email = mock(ChannelSender.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final InMemoryStore store = new InMemoryStore();
    private NotificationService service;

    @BeforeEach
    void setUp() {
        store.wire(notifications, deadLetters, templates);
        store.template("order-receipt", ChannelType.EMAIL, "Receipt", "<p>{{courseTitle}}</p>");
        when(email.channel()).thenReturn(ChannelType.EMAIL);
        when(idempotency.claim(anyString(), anyString(), any(ChannelType.class), anyInt())).thenReturn(true);
        service = new NotificationService(notifications, deadLetters, new TemplateService(templates), idempotency,
                new ChannelSenderRegistry(List.of(email)), new NotificationMetrics(meters, deadLetters), rateLimits,
                JsonMapper.builder().build());
    }

    private static NotificationMessage message(List<ChannelType> channels) {
        return new NotificationMessage("n1", "learnsphere", "u1", channels, "order-receipt",
                new NotificationTarget("a@b.c", null, null), Map.of("courseTitle", "Kafka"), 0);
    }

    private double counter(String name, String... tags) {
        return meters.counter(name, tags).count();
    }

    @Test
    void sendsAndCounts() {
        when(email.send(any(), any(), any())).thenReturn(SendResult.sent("smtp", "<id@x>"));
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 0)).isEmpty();
        assertThat(store.row("n1", ChannelType.EMAIL).get().getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(counter("notifications_received_total", "tenant", "learnsphere", "channel", "EMAIL")).isEqualTo(1);
        assertThat(counter("notifications_sent_total", "tenant", "learnsphere", "channel", "EMAIL")).isEqualTo(1);
        assertThat(meters.timer("notifications_send_seconds", "channel", "EMAIL").count()).isEqualTo(1);
    }

    @Test
    void aRateLimitedSendWaitsOnTheRetryTopicWithoutTouchingTheProvider() {
        when(rateLimits.check("learnsphere", ChannelType.EMAIL, "u1", "order-receipt")).thenReturn("rate limited: EMAIL quota");
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 0)).containsExactly(ChannelType.EMAIL);
        verify(email, never()).send(any(), any(), any());
        Notification row = store.row("n1", ChannelType.EMAIL).get();
        assertThat(row.getStatus()).isEqualTo(NotificationStatus.RETRYING);
        assertThat(row.getAttempts()).isZero(); // waiting is not an attempt
        assertThat(counter("notifications_rate_limited_total", "tenant", "learnsphere", "channel", "EMAIL")).isEqualTo(1);
    }

    @Test
    void aTransientFailureAsksForARetryAndASettledRowIsNeverResent() {
        when(email.send(any(), any(), any()))
                .thenReturn(SendResult.failed("smtp", ErrorType.TRANSIENT, "timeout"))
                .thenReturn(SendResult.sent("smtp", "<id@x>"));
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 0)).containsExactly(ChannelType.EMAIL);
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 1)).isEmpty();
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 2)).isEmpty(); // already SENT: skipped
        verify(email, times(2)).send(any(), any(), any());
        assertThat(store.row("n1", ChannelType.EMAIL).get().getAttempts()).isEqualTo(2);
        verify(idempotency).claim("learnsphere", "n1", ChannelType.EMAIL, 1); // each hop is its own attempt
    }

    @Test
    void aSkippedPushIsNotAFailure() {
        ChannelSender push = mock(ChannelSender.class);
        when(push.channel()).thenReturn(ChannelType.PUSH);
        when(push.send(any(), any(), any())).thenReturn(SendResult.skipped("fcm", "user has no registered devices"));
        store.template("order-receipt", ChannelType.PUSH, "t", "b");
        service = new NotificationService(notifications, deadLetters, new TemplateService(templates), idempotency,
                new ChannelSenderRegistry(List.of(push)), new NotificationMetrics(meters, deadLetters), rateLimits,
                JsonMapper.builder().build());
        assertThat(service.process(message(List.of(ChannelType.PUSH)), 0)).isEmpty();
        assertThat(store.row("n1", ChannelType.PUSH).get().getStatus()).isEqualTo(NotificationStatus.SKIPPED);
        assertThat(store.deadLetters).isEmpty();
    }

    @Test
    void aChannelWithNoSenderIsDeadLetteredAndDoesNotBlockTheOthers() {
        when(email.send(any(), any(), any())).thenReturn(SendResult.sent("smtp", "<id@x>"));
        assertThat(service.process(message(List.of(ChannelType.SMS, ChannelType.EMAIL)), 0)).isEmpty();
        assertThat(store.row("n1", ChannelType.EMAIL).get().getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(store.deadLetters).singleElement().satisfies(d -> {
            assertThat(d.getChannel()).isEqualTo(ChannelType.SMS);
            assertThat(d.getErrorType()).isEqualTo(ErrorType.PERMANENT);
        });
        assertThat(counter("notifications_failed_total", "tenant", "learnsphere", "channel", "SMS", "errorType", "PERMANENT")).isEqualTo(1);
    }

    @Test
    void aRedeliveryOfTheSameAttemptIsSuppressed() {
        when(idempotency.claim("learnsphere", "n1", ChannelType.EMAIL, 0)).thenReturn(false);
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 0)).isEmpty();
        verify(email, never()).send(any(), any(), any());
    }

    @Test
    void messagesWithoutATenantOrChannelsAreDropped() {
        assertThat(service.process(new NotificationMessage("n1", null, "u1", List.of(ChannelType.EMAIL), "t", null, null, 0), 0)).isEmpty();
        assertThat(service.process(new NotificationMessage("n1", "learnsphere", "u1", List.of(), "t", null, null, 0), 0)).isEmpty();
        verify(email, never()).send(any(), any(), any());
    }

    @Test
    void theOpenDeadLetterGaugeTracksUnreplayedLetters() {
        assertThat(meters.get("notifications_dead_letters_open").gauge().value()).isZero();
        service.process(message(List.of(ChannelType.SMS)), 0);
        assertThat(meters.get("notifications_dead_letters_open").gauge().value()).isEqualTo(1);
    }

    @Test
    void anInAppMessageIsSavedAsTheUsersInboxEntry() {
        store.template("order-receipt", ChannelType.IN_APP, "You're in — {{courseTitle}}", "Payment of {{amount}} received.");
        when(email.send(any(), any(), any())).thenReturn(SendResult.sent("smtp", "<id@x>"));
        service = new NotificationService(notifications, deadLetters, new TemplateService(templates), idempotency,
                new ChannelSenderRegistry(List.of(email, new InAppSender())), new NotificationMetrics(meters, deadLetters),
                rateLimits, JsonMapper.builder().build());

        // no target: the inbox needs none
        assertThat(service.process(new NotificationMessage("n1", "learnsphere", "u1", List.of(ChannelType.EMAIL, ChannelType.IN_APP),
                "order-receipt", new NotificationTarget("a@b.c", null, null),
                Map.of("courseTitle", "Kafka", "amount", "₹499.00", "link", "/courses/c1"), 0), 0)).isEmpty();

        Notification row = store.row("n1", ChannelType.IN_APP).orElseThrow();
        assertThat(row.getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(row.getTitle()).isEqualTo("You're in — Kafka");
        assertThat(row.getBody()).isEqualTo("Payment of ₹499.00 received.");
        assertThat(row.getLink()).isEqualTo("/courses/c1");
        assertThat(row.getTarget()).isEqualTo("inbox");
        // only the inbox row carries the rendered text
        assertThat(store.row("n1", ChannelType.EMAIL).orElseThrow().getTitle()).isNull();

        var inbox = new InboxService(notifications).list("learnsphere", "u1", 30);
        assertThat(inbox.items()).singleElement().satisfies(item -> {
            assertThat(item.notificationId()).isEqualTo("n1");
            assertThat(item.title()).isEqualTo("You're in — Kafka");
            assertThat(item.readAt()).isNull();
        });
        assertThat(inbox.unread()).isEqualTo(1);
        assertThat(new InboxService(notifications).list("learnsphere", "u2", 30).items()).isEmpty();
    }

    @Test
    void anUnexpectedRenderErrorWouldNotLoseTheMessage() {
        when(email.send(any(), any(), any())).thenThrow(new IllegalStateException("boom"));
        assertThat(service.process(message(List.of(ChannelType.EMAIL)), 0)).containsExactly(ChannelType.EMAIL);
        assertThat(store.row("n1", ChannelType.EMAIL).get().getStatus()).isEqualTo(NotificationStatus.RETRYING);
        assertThat(meters.find("notifications_failed_total").counters()).isEmpty();
        assertThat(new RenderedContent("a", "b").body()).isEqualTo("b");
    }
}
