package com.lms.notification_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Twilio Programmable Messaging. `from` is an E.164 number or a Messaging Service SID (MG…). */
@ConfigurationProperties("lms.notification.sms")
public record SmsProperties(boolean enabled, String accountSid, String authToken, String from, String baseUrl,
                            Duration timeout) {
}
