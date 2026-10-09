package com.lms.order_service.models.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** amountMinor omitted = refund everything that remains. */
public record RefundRequest(
        @Positive Long amountMinor,
        @NotBlank(message = "reason is required") @Size(max = 255) String reason) {
}
