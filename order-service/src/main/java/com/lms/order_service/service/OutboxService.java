package com.lms.order_service.service;

import com.lms.order_service.constants.ApplicationConstants;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.OutboxMessage;
import com.lms.order_service.repository.OutboxRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

/** Writes events next to the state change, in the caller's transaction. Kafka is never touched here. */
@Service
@RequiredArgsConstructor
public class OutboxService {

    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    // MANDATORY: an outbox row written outside the state change's transaction defeats the point
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(String topic, Order order, Object event) {
        outboxRepository.save(OutboxMessage.of(
                ApplicationConstants.AGGREGATE_ORDER,
                order.getId().toString(),
                topic,
                order.getUserId(), // keyed by user: a user's paid/refunded events stay ordered
                objectMapper.writeValueAsString(event),
                clock.instant()));
    }
}
