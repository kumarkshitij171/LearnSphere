package com.lms.notification_service.kafka;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.DeadLetter;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.models.event.NotificationTarget;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.DeviceTokenRepository;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.repository.TemplateRepository;
import com.lms.notification_service.service.DeadLetterService;
import com.lms.notification_service.service.IdempotencyService;
import com.lms.notification_service.support.InMemoryStore;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

/**
 * The whole pipeline on a real (embedded) Kafka broker: listener → retry topics → DLQ → replay.
 * Mongo, SMTP and Redis are the only things replaced.
 */
@SpringBootTest(properties = {
        "spring.kafka.bootstrap-servers=${spring.embedded.kafka.brokers}",
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.mongodb.autoconfigure.MongoAutoConfiguration,"
                + "org.springframework.boot.data.mongodb.autoconfigure.DataMongoAutoConfiguration,"
                + "org.springframework.boot.data.mongodb.autoconfigure.DataMongoRepositoriesAutoConfiguration,"
                + "org.springframework.boot.mongodb.autoconfigure.health.MongoHealthContributorAutoConfiguration,"
                + "org.springframework.boot.mongodb.autoconfigure.metrics.MongoMetricsAutoConfiguration",
        "lms.auth.access-token-secret=it-secret",
        "lms.auth.internal-api-key=it-key",
        "lms.notification.seed-templates=false",
        "lms.notification.topic-partitions=1",
        "lms.notification.retry.attempts=3",
        "lms.notification.retry.initial-delay-ms=300",
        "lms.notification.retry.multiplier=1.5",
        "lms.notification.retry.max-delay-ms=2000",
        "lms.notification.rate-limit.enabled=false",
        "management.health.mail.enabled=false",
        // pinned so a developer's local .env cannot blank the sender
        "lms.notification.mail-from=it@learnsphere.local",
})
@EmbeddedKafka(partitions = 1, topics = {"notifications", "notifications_dlq"})
@DirtiesContext
class DeliveryFlowIntegrationTest {

    @MockitoBean NotificationRepository notificationRepository;
    @MockitoBean DeadLetterRepository deadLetterRepository;
    @MockitoBean TemplateRepository templateRepository;
    @MockitoBean DeviceTokenRepository deviceTokenRepository;
    @MockitoBean IdempotencyService idempotencyService;
    @MockitoBean JavaMailSender mailSender;

    @Autowired KafkaTemplate<String, String> kafka;
    @Autowired ObjectMapper objectMapper;
    @Autowired DeadLetterService deadLetterService;
    @Autowired MeterRegistry meters;

    private final InMemoryStore store = new InMemoryStore();
    private final AtomicInteger mailAttempts = new AtomicInteger();
    private final List<MimeMessage> sentMail = new java.util.concurrent.CopyOnWriteArrayList<>();

    @BeforeEach
    void setUp() {
        store.clear();
        mailAttempts.set(0);
        sentMail.clear();
        reset(mailSender);
        store.wire(notificationRepository, deadLetterRepository, templateRepository);
        when(idempotencyService.claim(anyString(), anyString(), any(ChannelType.class), anyInt())).thenReturn(true);
        when(mailSender.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
        store.template("order-receipt", ChannelType.EMAIL, "Receipt: {{courseTitle}}", "<p>{{courseTitle}}</p>");
    }

    private String publish(List<ChannelType> channels, String template) {
        String id = "n-" + UUID.randomUUID();
        NotificationMessage message = new NotificationMessage(id, "learnsphere", "u1", channels, template,
                new NotificationTarget("student@example.com", null, null), Map.of("courseTitle", "Kafka 101"), 0);
        kafka.send("notifications", "u1", objectMapper.writeValueAsString(message));
        return id;
    }

    private void mailOutcomes(boolean... succeed) {
        doAnswer(inv -> {
            int n = mailAttempts.getAndIncrement();
            if (n < succeed.length && !succeed[n]) throw new MailSendException("connect timed out");
            sentMail.add(inv.getArgument(0));
            return null;
        }).when(mailSender).send(any(MimeMessage.class));
    }

    private static void await(String what, BooleanSupplier condition) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (Instant.now().isBefore(deadline)) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(100);
        }
        throw new AssertionError("Timed out waiting for: " + what);
    }

    @Test
    void anEmailIsRenderedAndSent() throws Exception {
        mailOutcomes(true);
        String id = publish(List.of(ChannelType.EMAIL), "order-receipt");
        await("SENT", () -> store.row(id, ChannelType.EMAIL).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        assertThat(mailAttempts.get()).isEqualTo(1);
        assertThat(store.row(id, ChannelType.EMAIL).get().getAttempts()).isEqualTo(1);
        assertThat(store.deadLetters).isEmpty();
    }

    @Test
    void aTransientFailureIsRetriedThroughTheRetryTopicAndThenSucceeds() throws Exception {
        mailOutcomes(false, true);
        String id = publish(List.of(ChannelType.EMAIL), "order-receipt");
        await("SENT after a retry", () -> store.row(id, ChannelType.EMAIL).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        assertThat(mailAttempts.get()).isEqualTo(2);
        assertThat(store.row(id, ChannelType.EMAIL).get().getAttempts()).isEqualTo(2);
        assertThat(store.deadLetters).isEmpty();
    }

    @Test
    void exhaustedRetriesLandInTheDlqAsADeadLetter() throws Exception {
        mailOutcomes(false, false, false, false, false);
        String id = publish(List.of(ChannelType.EMAIL), "order-receipt");
        await("dead letter", () -> store.deadLetters.stream().anyMatch(d -> d.getNotificationId().equals(id)));
        DeadLetter letter = store.deadLetters.get(0);
        assertThat(letter.getErrorType()).isEqualTo(ErrorType.EXHAUSTED_RETRIES);
        assertThat(letter.getChannel()).isEqualTo(ChannelType.EMAIL);
        assertThat(letter.getPayload()).contains(id);
        // attempts = 3: the main topic plus two retry hops, never more
        assertThat(mailAttempts.get()).isEqualTo(3);
        assertThat(store.row(id, ChannelType.EMAIL).get().getStatus()).isEqualTo(NotificationStatus.FAILED);
        assertThat(meters.counter("notifications_failed_total", "tenant", "learnsphere", "channel", "EMAIL",
                "errorType", "EXHAUSTED_RETRIES").count()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void aPermanentFailureIsNotRetriedAndIsDeadLetteredAtOnce() throws Exception {
        mailOutcomes(true);
        String id = publish(List.of(ChannelType.EMAIL), "no-such-template");
        await("dead letter", () -> store.deadLetters.stream().anyMatch(d -> d.getNotificationId().equals(id)));
        Thread.sleep(1500); // longer than a retry hop: nothing else may happen
        assertThat(store.deadLetters).hasSize(1);
        assertThat(store.deadLetters.get(0).getErrorType()).isEqualTo(ErrorType.PERMANENT);
        assertThat(mailAttempts.get()).isZero();
    }

    @Test
    void aRetryOfAMultiChannelMessageDoesNotResendWhatAlreadyWentOut() throws Exception {
        // EMAIL succeeds; PUSH has no sender (push is disabled here) → permanent, so nothing retries
        mailOutcomes(true);
        String id = publish(List.of(ChannelType.EMAIL, ChannelType.PUSH), "order-receipt");
        await("both channels settled", () -> store.row(id, ChannelType.EMAIL).isPresent() && store.row(id, ChannelType.PUSH).isPresent()
                && store.row(id, ChannelType.PUSH).get().getStatus() == NotificationStatus.FAILED);
        Thread.sleep(1500);
        assertThat(mailAttempts.get()).isEqualTo(1);
        assertThat(store.row(id, ChannelType.EMAIL).get().getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(store.deadLetters).singleElement().satisfies(d -> assertThat(d.getChannel()).isEqualTo(ChannelType.PUSH));
    }

    @Test
    void aTransientEmailRetriesWhileTheSentPushIsLeftAlone() throws Exception {
        // EMAIL fails once then works; PUSH permanently fails — the retry must only redo EMAIL
        mailOutcomes(false, true);
        String id = publish(List.of(ChannelType.EMAIL, ChannelType.PUSH), "order-receipt");
        await("email SENT", () -> store.row(id, ChannelType.EMAIL).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        assertThat(mailAttempts.get()).isEqualTo(2);
        assertThat(store.deadLetters).hasSize(1); // the push, recorded once, not once per retry
    }

    @Test
    void theInboxNeedsNoConfigAndLandsWhilePushIsOff() throws Exception {
        store.template("order-receipt", ChannelType.IN_APP, "You're in — {{courseTitle}}", "Your course is unlocked.");
        String id = publish(List.of(ChannelType.PUSH, ChannelType.IN_APP), "order-receipt");
        await("inbox row SENT", () -> store.row(id, ChannelType.IN_APP).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        var row = store.row(id, ChannelType.IN_APP).get();
        assertThat(row.getTitle()).isEqualTo("You're in — Kafka 101");
        assertThat(row.getBody()).isEqualTo("Your course is unlocked.");
        assertThat(row.getUserId()).isEqualTo("u1");
        assertThat(row.getReadAt()).isNull();
    }

    @Test
    void aDeadLetterIsReplayedOnceTheCauseIsFixed() throws Exception {
        mailOutcomes(true);
        String id = publish(List.of(ChannelType.EMAIL), "receipt-v2");
        await("dead letter", () -> store.deadLetters.stream().anyMatch(d -> d.getNotificationId().equals(id)));

        store.template("receipt-v2", ChannelType.EMAIL, "Receipt", "<p>{{courseTitle}}</p>"); // the fix
        NotificationMessage replayed = deadLetterService.replay("learnsphere", store.deadLetters.get(0).getId(), "admin-1");
        assertThat(replayed.channels()).containsExactly(ChannelType.EMAIL);
        assertThat(replayed.attempt()).isGreaterThan(0);

        await("SENT after replay", () -> store.row(id, ChannelType.EMAIL).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        assertThat(store.deadLetters.get(0).getReplayedAt()).isNotNull();
        assertThat(mailAttempts.get()).isEqualTo(1);
    }

    @Test
    void aMalformedRecordIsDiscardedWithoutStallingThePartition() throws Exception {
        mailOutcomes(true);
        kafka.send("notifications", "u1", "{not json");
        String id = publish(List.of(ChannelType.EMAIL), "order-receipt");
        await("the next record still flows", () -> store.row(id, ChannelType.EMAIL).map(n -> n.getStatus() == NotificationStatus.SENT).orElse(false));
        assertThat(store.deadLetters).isEmpty();
    }

    @Test
    void theBackendsActivationEmailRendersThroughTheSeededTemplate() throws Exception {
        // the seed file as shipped, and a message in exactly the shape backend/services/notification.service.ts publishes
        com.lms.notification_service.models.entity.Template seeded = objectMapper.readValue(
                getClass().getResourceAsStream("/seed-templates/account-activation.email.json"),
                com.lms.notification_service.models.entity.Template.class);
        seeded.setTenantId("learnsphere");
        seeded.setActive(true);
        store.templates.put("account-activation/EMAIL", seeded);
        mailOutcomes(true);

        String backendMessage = """
                {"notificationId":"u1:activation:0123456789abcdef","tenantId":"learnsphere","userId":"u1",
                 "channels":["EMAIL"],"templateName":"account-activation",
                 "target":{"email":"jane@example.com","phone":null,"deviceTokens":null},
                 "variables":{"name":"Jane","activationCode":"482193","activationUrl":"http://localhost:3000/verify?otp=482193&token=abc"},
                 "attempt":0}""";
        kafka.send("notifications", "u1", backendMessage);

        await("activation email sent", () -> !sentMail.isEmpty());
        MimeMessage mail = sentMail.get(0);
        assertThat(mail.getSubject()).isEqualTo("Your LearnSphere activation code: 482193");
        assertThat(mail.getAllRecipients()[0].toString()).isEqualTo("jane@example.com");
        String html = (String) mail.getContent();
        assertThat(html).contains("Welcome to LearnSphere, Jane!").contains(">482193<")
                .contains("href=\"http://localhost:3000/verify?otp=482193&amp;token=abc\"").doesNotContain("{{");
    }
}
