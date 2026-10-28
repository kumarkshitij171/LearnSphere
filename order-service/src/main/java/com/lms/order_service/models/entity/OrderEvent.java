package com.lms.order_service.models.entity;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

/** Append-only audit row: one per transition, never updated, never deleted. */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "order_events")
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", updatable = false)
    private OrderStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, updatable = false)
    private OrderStatus toStatus;

    @Column(nullable = false, updatable = false)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Actor actor;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static OrderEvent of(UUID orderId, OrderStatus from, OrderStatus to, String reason, Actor actor,
                                Instant at) {
        OrderEvent event = new OrderEvent();
        event.orderId = orderId;
        event.fromStatus = from;
        event.toStatus = to;
        event.reason = reason;
        event.actor = actor;
        event.createdAt = at;
        return event;
    }
}
