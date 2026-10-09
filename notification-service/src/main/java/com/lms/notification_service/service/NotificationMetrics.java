package com.lms.notification_service.service;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.repository.DeadLetterRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * SYSTEM_DESIGN.md §11. Counters by tenant and channel, a send-latency timer, and the gauge worth
 * alerting on: dead letters nobody has replayed yet.
 */
@Component
public class NotificationMetrics {

    private final MeterRegistry registry;

    public NotificationMetrics(MeterRegistry registry, DeadLetterRepository deadLetters) {
        this.registry = registry;
        Gauge.builder("notifications_dead_letters_open", deadLetters, repo -> safeCount(repo))
                .description("Dead letters waiting for a fix and a replay")
                .register(registry);
    }

    public void received(String tenantId, ChannelType channel) {
        registry.counter("notifications_received_total", "tenant", tenantId, "channel", channel.name()).increment();
    }

    public void sent(String tenantId, ChannelType channel) {
        registry.counter("notifications_sent_total", "tenant", tenantId, "channel", channel.name()).increment();
    }

    public void failed(String tenantId, ChannelType channel, ErrorType errorType) {
        registry.counter("notifications_failed_total", "tenant", tenantId, "channel", channel.name(),
                "errorType", errorType == null ? "UNKNOWN" : errorType.name()).increment();
    }

    public void retried(String tenantId, ChannelType channel) {
        registry.counter("notifications_retried_total", "tenant", tenantId, "channel", channel.name()).increment();
    }

    public void rateLimited(String tenantId, ChannelType channel) {
        registry.counter("notifications_rate_limited_total", "tenant", tenantId, "channel", channel.name()).increment();
    }

    public void sendLatency(ChannelType channel, long nanos) {
        Timer.builder("notifications_send_seconds").tag("channel", channel.name()).register(registry)
                .record(nanos, TimeUnit.NANOSECONDS);
    }

    private static double safeCount(DeadLetterRepository repo) {
        try {
            return repo.countByReplayedAtIsNull();
        } catch (RuntimeException e) {
            return Double.NaN; // Mongo unreachable: report unknown, never fail the scrape
        }
    }
}
