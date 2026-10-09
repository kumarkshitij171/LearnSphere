package com.lms.order_service.models.domain;

import org.springframework.http.HttpStatus;

/** SYSTEM_DESIGN.md §13. */
public enum ErrorType {
    VALIDATION(HttpStatus.BAD_REQUEST),
    AUTH(HttpStatus.UNAUTHORIZED),
    FORBIDDEN(HttpStatus.FORBIDDEN),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
    NOT_FOUND(HttpStatus.NOT_FOUND),
    CONFLICT(HttpStatus.CONFLICT),
    NOT_PURCHASABLE(HttpStatus.PAYMENT_REQUIRED),
    PROVIDER_TRANSIENT(HttpStatus.SERVICE_UNAVAILABLE),
    PROVIDER_PERMANENT(HttpStatus.BAD_GATEWAY),
    INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorType(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
