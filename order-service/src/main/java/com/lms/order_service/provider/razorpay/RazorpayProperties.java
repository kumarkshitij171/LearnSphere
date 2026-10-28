package com.lms.order_service.provider.razorpay;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties("lms.payment.razorpay")
public record RazorpayProperties(boolean enabled, String keyId, String keySecret, String webhookSecret,
                                 String baseUrl, Duration timeout) {
}
