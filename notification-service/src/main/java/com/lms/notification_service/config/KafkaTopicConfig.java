package com.lms.notification_service.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/** The retry topics (`<main>_retry-N`) are created by @RetryableTopic; the main topic and the DLQ are declared here. */
@Configuration
public class KafkaTopicConfig {

    @Value("${lms.notification.topic-partitions}")
    private int partitions;

    @Bean
    public NewTopic notificationsTopic(@Value("${lms.notification.topics.main}") String topic) {
        return TopicBuilder.name(topic).partitions(partitions).replicas(1).build();
    }

    @Bean
    public NewTopic notificationsDlqTopic(@Value("${lms.notification.topics.dlq}") String topic) {
        return TopicBuilder.name(topic).partitions(partitions).replicas(1).build();
    }
}
