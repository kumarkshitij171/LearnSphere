package com.lms.order_service.models.entity;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/** One attempt to pay an order; an order may have several (card declined, then UPI). */
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "payments")
public class Payment extends AbstractEntity {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentProviderType provider;

    @Column(name = "provider_order_id", nullable = false)
    private String providerOrderId;

    @Column(name = "provider_payment_id")
    private String providerPaymentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    private String method;

    @Column(name = "error_code")
    private String errorCode;

    @Column(name = "error_message")
    private String errorMessage;

    // what the browser needs to (re)open checkout; public values only, never a secret
    @JdbcTypeCode(SqlTypes.JSON)
    private String checkout;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload")
    private String rawPayload;

    public static Payment initiated(Order order, String providerOrderId, String checkoutJson) {
        Payment payment = new Payment();
        payment.id = UUID.randomUUID();
        payment.orderId = order.getId();
        payment.provider = order.getProvider();
        payment.providerOrderId = providerOrderId;
        payment.status = PaymentStatus.INITIATED;
        payment.amountMinor = order.getAmountMinor();
        payment.currency = order.getCurrency();
        payment.checkout = checkoutJson;
        return payment;
    }
}
