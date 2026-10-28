package com.lms.order_service.service;

import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Runs on every replica without leader election: each order is claimed with FOR UPDATE SKIP LOCKED,
 * so two sweepers never process the same order and neither waits on the other.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReconciliationSweeper {

    private static final List<OrderStatus> ACTIVE = List.of(OrderStatus.CREATED, OrderStatus.PENDING);

    private final OrderRepository orderRepository;
    private final ReconciliationService reconciliationService;
    private final Clock clock;

    @Value("${lms.order.sweeper.grace}")
    private Duration grace;

    @Value("${lms.order.sweeper.batch-size}")
    private int batchSize;

    @Scheduled(initialDelayString = "${lms.order.sweeper.initial-delay-ms}",
            fixedDelayString = "${lms.order.sweeper.interval-ms}")
    public void sweep() {
        Instant now = clock.instant();
        List<UUID> candidates = orderRepository.findReconciliationCandidates(ACTIVE, now, now.minus(grace),
                PageRequest.of(0, batchSize));
        if (candidates.isEmpty()) return;

        Map<ReconciliationService.Outcome, Integer> tally = new EnumMap<>(ReconciliationService.Outcome.class);
        for (UUID id : candidates) {
            try {
                tally.merge(reconciliationService.reconcile(id), 1, Integer::sum);
            } catch (Exception e) {
                log.warn("Reconciliation of order {} failed, retrying next sweep: {}", id, e.getMessage());
            }
        }
        log.info("Reconciliation sweep over {} order(s): {}", candidates.size(), tally);
    }
}
