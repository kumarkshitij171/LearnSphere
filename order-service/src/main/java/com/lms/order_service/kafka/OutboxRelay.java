package com.lms.order_service.kafka;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.models.entity.OutboxMessage;
import com.lms.order_service.repository.OutboxRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Publishes committed outbox rows. At-least-once: a crash between send and commit republishes, which
 * every consumer absorbs (enrolment is an upsert, notifications dedupe on notificationId).
 */
@Slf4j
@Component
public class OutboxRelay {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final TransactionTemplate transactionTemplate;
    private final OrderProperties props;
    private final Clock clock;

    public OutboxRelay(OutboxRepository outboxRepository, KafkaTemplate<String, String> kafkaTemplate,
                       TransactionTemplate transactionTemplate, OrderProperties props, Clock clock) {
        this.outboxRepository = outboxRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.transactionTemplate = transactionTemplate;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${lms.order.outbox.poll-interval-ms}")
    public void relay() {
        Integer published = transactionTemplate.execute(status -> publishBatch());
        if (published != null && published > 0) log.debug("Outbox relay published {} message(s)", published);
    }

    int publishBatch() {
        List<OutboxMessage> batch = outboxRepository.lockUnpublishedBatch(props.outbox().batchSize());
        int published = 0;
        for (OutboxMessage message : batch) {
            try {
                kafkaTemplate.send(message.getTopic(), message.getMessageKey(), message.getPayload())
                        .get(props.outbox().sendTimeout().toMillis(), TimeUnit.MILLISECONDS);
                message.markPublished(clock.instant());
                published++;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                message.markFailed("interrupted");
                break;
            } catch (Exception e) {
                message.markFailed(e.getMessage());
                log.warn("Outbox message {} to {} failed (attempt {}): {}", message.getId(), message.getTopic(),
                        message.getAttempts(), e.getMessage());
                // stop here: a later row for the same user must not overtake this one
                break;
            }
        }
        return published;
    }
}
