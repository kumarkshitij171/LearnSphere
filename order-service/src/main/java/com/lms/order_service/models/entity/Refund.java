package com.lms.order_service.models.entity;

import com.lms.order_service.models.domain.RefundStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "refunds")
public class Refund extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    @Column(name = "provider_refund_id")
    private String providerRefundId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RefundStatus status;

    @Column(nullable = false)
    private String reason;

    @Column(name = "requested_by", nullable = false)
    private String requestedBy;

    private String error;

    public static Refund pending(Order order, Payment payment, long amountMinor, String reason, String requestedBy) {
        Refund refund = new Refund();
        refund.id = UUID.randomUUID();
        refund.orderId = order.getId();
        refund.paymentId = payment.getId();
        refund.amountMinor = amountMinor;
        refund.status = RefundStatus.PENDING;
        refund.reason = reason;
        refund.requestedBy = requestedBy;
        return refund;
    }
}
