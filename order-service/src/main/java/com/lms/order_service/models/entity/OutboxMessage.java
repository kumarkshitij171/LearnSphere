package com.lms.order_service.models.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/** An event written in the same transaction as the state change it describes; OutboxRelay publishes it. */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "outbox")
public class OutboxMessage {

    private static final int MAX_ERROR_LENGTH = 512;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "aggregate_type", nullable = false)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(nullable = false)
    private String topic;

    @Column(name = "message_key", nullable = false)
    private String messageKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "last_error")
    private String lastError;

    public static OutboxMessage of(String aggregateType, String aggregateId, String topic, String messageKey,
                                   String payload, Instant at) {
        OutboxMessage message = new OutboxMessage();
        message.aggregateType = aggregateType;
        message.aggregateId = aggregateId;
        message.topic = topic;
        message.messageKey = messageKey;
        message.payload = payload;
        message.createdAt = at;
        return message;
    }

    public void markPublished(Instant at) {
        attempts++;
        publishedAt = at;
        lastError = null;
    }

    public void markFailed(String error) {
        attempts++;
        lastError = error == null ? null : error.substring(0, Math.min(error.length(), MAX_ERROR_LENGTH));
    }
}
