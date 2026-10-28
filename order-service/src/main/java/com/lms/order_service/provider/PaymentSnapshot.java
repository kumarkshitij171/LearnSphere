package com.lms.order_service.provider;

import com.lms.order_service.models.domain.PaymentStatus;

public record PaymentSnapshot(boolean known, PaymentStatus status, String providerPaymentId, long amountMinor,
                              String currency) {

    public static PaymentSnapshot unknown() {
        return new PaymentSnapshot(false, null, null, 0, null);
    }
}
