package com.lms.order_service.service;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.WebhookEventStatus;
import com.lms.order_service.models.entity.WebhookEvent;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.WebhookVerification;
import com.lms.order_service.repository.WebhookEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

/**
 * One transaction per webhook: the dedup row, the order transition and the outbox rows commit
 * together. A crash mid-way rolls the dedup row back too, so the provider's retry is applied
 * rather than acknowledged as "already seen" and lost.
 */
@Component
@RequiredArgsConstructor
public class WebhookProcessor {

    private final WebhookEventRepository webhookEventRepository;
    private final PaymentEventHandler paymentEventHandler;
    private final Clock clock;

    @Transactional
    public WebhookOutcome process(PaymentProvider provider, WebhookVerification verified) {
        PaymentProviderType type = provider.type();
        if (webhookEventRepository.existsByProviderAndProviderEventId(type, verified.providerEventId())) {
            return WebhookOutcome.duplicate();
        }
        WebhookEvent record = webhookEventRepository.saveAndFlush(WebhookEvent.received(
                type, verified.providerEventId(), verified.eventType(), verified.rawBody(), clock.instant()));

        List<PaymentEvent> events = provider.parse(verified);
        if (events.isEmpty()) {
            record.complete(WebhookEventStatus.IGNORED, "event type not handled: " + verified.eventType(), clock.instant());
            return WebhookOutcome.handled(WebhookEventStatus.IGNORED, record.getError());
        }

        WebhookEventStatus overall = WebhookEventStatus.IGNORED;
        StringBuilder detail = new StringBuilder();
        for (PaymentEvent event : events) {
            PaymentEventHandler.Result result = paymentEventHandler.apply(type, event, Actor.WEBHOOK);
            if (result.status() == WebhookEventStatus.FAILED) overall = WebhookEventStatus.FAILED;
            else if (result.status() == WebhookEventStatus.PROCESSED && overall != WebhookEventStatus.FAILED) {
                overall = WebhookEventStatus.PROCESSED;
            }
            if (!detail.isEmpty()) detail.append("; ");
            detail.append(result.detail());
        }
        String summary = detail.length() > 512 ? detail.substring(0, 512) : detail.toString();
        record.complete(overall, overall == WebhookEventStatus.PROCESSED ? null : summary, clock.instant());
        return WebhookOutcome.handled(overall, summary);
    }
}
