package com.lms.order_service.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties("lms.catalogue")
public record CatalogueProperties(
        @NotBlank String baseUrl,
        @NotBlank(message = "INTERNAL_API_KEY must be set (same value as backend)") String internalApiKey,
        @NotNull Duration timeout) {
}
