package com.lms.order_service.provider.stripe;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** successUrl/cancelUrl may contain {courseId} and {orderId}; the buyer lands back on the course page. */
@ConfigurationProperties("lms.payment.stripe")
public record StripeProperties(boolean enabled, String secretKey, String webhookSecret, String baseUrl,
                               String successUrl, String cancelUrl, Duration timeout,
                               Duration signatureTolerance) {
}
