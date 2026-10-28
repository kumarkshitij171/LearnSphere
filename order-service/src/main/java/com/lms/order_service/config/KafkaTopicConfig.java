package com.lms.order_service.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/** Declared up front so the first publish never races topic auto-creation. */
@Configuration
public class KafkaTopicConfig {

    @Bean
    public NewTopic orderPaidTopic(OrderProperties props) {
        return topic(props.topics().paid(), props);
    }

    @Bean
    public NewTopic orderFailedTopic(OrderProperties props) {
        return topic(props.topics().failed(), props);
    }

    @Bean
    public NewTopic orderRefundedTopic(OrderProperties props) {
        return topic(props.topics().refunded(), props);
    }

    private static NewTopic topic(String name, OrderProperties props) {
        return TopicBuilder.name(name).partitions(props.topicPartitions()).replicas(1).build();
    }
}
