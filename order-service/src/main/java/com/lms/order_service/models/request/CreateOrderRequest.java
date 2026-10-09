package com.lms.order_service.models.request;

import com.lms.order_service.models.domain.PaymentProviderType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** No amount field, on purpose: the price always comes from the catalogue. */
public record CreateOrderRequest(
        @NotBlank(message = "courseId is required") @Size(max = 64) String courseId,
        @NotNull(message = "provider is required") PaymentProviderType provider,
        // required: it is what makes a retried POST return the same order
        @NotBlank(message = "idempotencyKey is required") @Size(max = 128) String idempotencyKey) {
}
