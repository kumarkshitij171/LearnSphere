package com.lms.notification_service.security;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

// Missing secrets stop startup: a service that boots without them rejects every request.
@Validated
@ConfigurationProperties("lms.auth")
public record AuthProperties(
        @NotBlank(message = "ACCESS_TOKEN_SECRET must be set (same value as backend)") String accessTokenSecret,
        @NotBlank String accessTokenCookie,
        @NotBlank(message = "INTERNAL_API_KEY must be set (same value as backend)") String internalApiKey) {
}
