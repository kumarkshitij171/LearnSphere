package com.lms.order_service.provider;

/** processed=true when the provider settled it synchronously; otherwise a refund webhook confirms it later. */
public record RefundResult(boolean accepted, String providerRefundId, boolean processed, String errorMessage) {
}
