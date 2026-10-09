package com.lms.notification_service.kafka;

import tools.jackson.databind.ObjectMapper;
import com.lms.notification_service.models.event.NotificationMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@RequiredArgsConstructor
public class NotificationProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    @Value("${lms.notification.topics.main}")
    private String mainTopic;

    /** Keyed by userId so a single user's notifications keep their order across partitions. */
    public void publish(NotificationMessage message) {
        try {
            kafkaTemplate.send(mainTopic, message.userId(), objectMapper.writeValueAsString(message));
            log.info("Published notification {} to {}", message.notificationId(), mainTopic);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to publish notification " + message.notificationId(), e);
        }
    }
}
