package com.lms.notification_service.kafka;

import com.lms.notification_service.exception.TransientDeliveryException;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.kafka.annotation.BackOff;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.retrytopic.RetryTopicHeaders;
import org.springframework.kafka.retrytopic.TopicSuffixingStrategy;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.nio.ByteBuffer;
import java.util.List;

/**
 * Main topic → `<main>_retry-N` (non-blocking backoff) → `<main>_dlq`. Only a transient failure is
 * retried; the listener never sleeps, so a slow provider costs one record a delay, not the
 * partition its throughput.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class NotificationListener {

    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;

    @RetryableTopic(
            attempts = "${lms.notification.retry.attempts}",
            backOff = @BackOff(
                    delayString = "${lms.notification.retry.initial-delay-ms}",
                    multiplierString = "${lms.notification.retry.multiplier}",
                    maxDelayString = "${lms.notification.retry.max-delay-ms}"),
            include = TransientDeliveryException.class,
            retryTopicSuffix = "_retry",
            dltTopicSuffix = "_dlq",
            topicSuffixingStrategy = TopicSuffixingStrategy.SUFFIX_WITH_INDEX_VALUE,
            numPartitions = "${lms.notification.topic-partitions}",
            replicationFactor = "1")
    @KafkaListener(topics = "${lms.notification.topics.main}", groupId = "${spring.kafka.consumer.group-id}")
    public void onNotification(ConsumerRecord<String, String> record) {
        NotificationMessage message = parse(record.value());
        if (message == null) return;
        List<ChannelType> transientChannels = notificationService.process(message, deliveryAttempt(record));
        if (!transientChannels.isEmpty()) {
            throw new TransientDeliveryException(message.notificationId(), transientChannels);
        }
    }

    /** Retries exhausted (or a non-retryable error): settle what is still pending as a dead letter. */
    @DltHandler
    public void onDeadLetter(ConsumerRecord<String, String> record) {
        NotificationMessage message = parse(record.value());
        if (message != null) notificationService.exhausted(message);
    }

    // a malformed record is logged and skipped instead of poisoning the partition
    private NotificationMessage parse(String payload) {
        try {
            return objectMapper.readValue(payload, NotificationMessage.class);
        } catch (Exception e) {
            log.error("Discarding unparseable notification record: {}", payload, e);
            return null;
        }
    }

    // 0 on the main topic; Spring Kafka stamps the attempt about to run on each retry hop
    static int deliveryAttempt(ConsumerRecord<String, String> record) {
        Header header = record.headers().lastHeader(RetryTopicHeaders.DEFAULT_HEADER_ATTEMPTS);
        if (header == null || header.value() == null || header.value().length < 4) return 0;
        return Math.max(ByteBuffer.wrap(header.value()).getInt() - 1, 0);
    }
}
