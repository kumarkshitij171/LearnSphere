package com.lms.order_service.models.entity;

import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentProviderType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

// "Order" is a reserved word in JPQL, hence the explicit entity name
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity(name = "PurchaseOrder")
@Table(name = "orders")
public class Order extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "user_email", nullable = false)
    private String userEmail;

    // snapshot from the token, so a receipt can greet the buyer without a user lookup
    @Column(name = "user_name")
    private String userName;

    @Column(name = "course_id", nullable = false)
    private String courseId;

    @Column(name = "course_title", nullable = false)
    private String courseTitle;

    @Column(name = "instructor_id", nullable = false)
    private String instructorId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Setter(AccessLevel.NONE)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentProviderType provider;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Version
    private long version;

    public static Order create(String tenantId, String userId, String userEmail, String userName, String courseId,
                               String courseTitle, String instructorId, long amountMinor, String currency,
                               PaymentProviderType provider, String idempotencyKey, Instant expiresAt) {
        Order order = new Order();
        order.id = UUID.randomUUID();
        order.tenantId = tenantId;
        order.userId = userId;
        order.userEmail = userEmail;
        order.userName = userName;
        order.courseId = courseId;
        order.courseTitle = courseTitle;
        order.instructorId = instructorId;
        order.amountMinor = amountMinor;
        order.currency = currency;
        order.status = OrderStatus.CREATED;
        order.provider = amountMinor == 0 ? PaymentProviderType.NONE : provider;
        order.idempotencyKey = idempotencyKey;
        order.expiresAt = expiresAt;
        return order;
    }

    /** Called only by OrderStateMachine, which validates the move and records it. */
    public void applyTransition(OrderStatus to, Instant at) {
        this.status = to;
        if (to == OrderStatus.PAID && paidAt == null) paidAt = at;
        if (to == OrderStatus.CANCELLED) cancelledAt = at;
    }

    public boolean isFree() {
        return amountMinor == 0;
    }
}
