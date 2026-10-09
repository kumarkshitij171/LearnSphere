package com.lms.order_service.service;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.provider.WebhookVerification;
import com.lms.order_service.utils.ConstraintViolations;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.Map;

/** Verify first, write nothing on a bad signature, answer 200 for anything already handled. */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookService {

    private final PaymentProviderRegistry registry;
    private final WebhookProcessor processor;

    public WebhookOutcome handle(PaymentProviderType type, String rawBody, Map<String, String> headers,
                                 String sourceIp) {
        PaymentProvider provider = registry.get(type)
                .orElseThrow(() -> ApiException.notFound("Payment provider " + type + " is not enabled"));

        WebhookVerification verified = provider.verify(rawBody, headers);
        if (!verified.valid()) {
            log.warn("ALERT rejected {} webhook from {}: {}", type, sourceIp, verified.failureReason());
            return WebhookOutcome.rejected("invalid signature");
        }
        try {
            WebhookOutcome outcome = processor.process(provider, verified);
            log.info("{} webhook {} ({}): {} {}", type, verified.providerEventId(), verified.eventType(),
                    outcome.status(), outcome.detail());
            return outcome;
        } catch (DataIntegrityViolationException e) {
            // the same event delivered twice at once: the other delivery committed first
            if (ConstraintViolations.isViolationOf(e, "uq_webhook_event")) return WebhookOutcome.duplicate();
            throw e;
        }
    }
}
