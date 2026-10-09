package com.lms.order_service.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties("lms.order")
public record OrderProperties(
        @NotBlank String defaultTenant,
        @NotNull Duration ttl,
        @Valid @NotNull Topics topics,
        @Min(1) int topicPartitions,
        @Valid @NotNull Outbox outbox) {

    public record Topics(@NotBlank String paid, @NotBlank String failed, @NotBlank String refunded,
                         @NotBlank String notifications) {
    }

    public record Outbox(@Min(1) int batchSize, @Min(100) long pollIntervalMs, @NotNull Duration sendTimeout) {
    }
}
