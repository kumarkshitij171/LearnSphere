package com.lms.order_service.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

// Fails startup when the secret is missing: a service that boots without it rejects every request.
@Validated
@ConfigurationProperties("lms.auth")
public record AuthProperties(
        @NotBlank(message = "ACCESS_TOKEN_SECRET must be set (same value as backend)") String accessTokenSecret,
        @NotBlank String accessTokenCookie) {
}
