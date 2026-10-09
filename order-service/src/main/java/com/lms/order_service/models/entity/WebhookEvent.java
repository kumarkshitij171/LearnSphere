package com.lms.order_service.models.entity;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.WebhookEventStatus;
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
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "webhook_events")
public class WebhookEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentProviderType provider;

    @Column(name = "provider_event_id", nullable = false)
    private String providerEventId;

    @Column(name = "event_type")
    private String eventType;

    @Column(name = "signature_valid", nullable = false)
    private boolean signatureValid;

    @JdbcTypeCode(SqlTypes.JSON)
    private String payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WebhookEventStatus status;

    private String error;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    public static WebhookEvent received(PaymentProviderType provider, String providerEventId, String eventType,
                                        String payload, Instant at) {
        WebhookEvent event = new WebhookEvent();
        event.provider = provider;
        event.providerEventId = providerEventId;
        event.eventType = eventType;
        event.signatureValid = true;
        event.payload = payload;
        event.status = WebhookEventStatus.RECEIVED;
        event.receivedAt = at;
        return event;
    }

    public void complete(WebhookEventStatus outcome, String error, Instant at) {
        this.status = outcome;
        this.error = error;
        this.processedAt = at;
    }
}
