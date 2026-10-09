package com.lms.notification_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * FCM over its HTTP v1 API. credentialsPath points at the Firebase service-account JSON; it is
 * read at startup when push is enabled and never logged.
 */
@ConfigurationProperties("lms.notification.push")
public record PushProperties(boolean enabled, String credentialsPath, String fcmBaseUrl, String linkBase,
                             Duration timeout) {
}
