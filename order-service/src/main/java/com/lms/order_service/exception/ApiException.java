package com.lms.order_service.exception;

import com.lms.order_service.models.domain.ErrorType;

/** Base for every error that maps to a classified HTTP response (SYSTEM_DESIGN.md §13). */
public class ApiException extends RuntimeException implements AbstractException {

    private final ErrorType errorType;

    public ApiException(ErrorType errorType, String message) {
        super(message);
        this.errorType = errorType;
    }

    public ApiException(ErrorType errorType, String message, Throwable cause) {
        super(message, cause);
        this.errorType = errorType;
    }

    @Override
    public ErrorType getErrorType() {
        return errorType;
    }

    @Override
    public String getErrorMessage() {
        return getMessage();
    }

    public static ApiException validation(String message) {
        return new ApiException(ErrorType.VALIDATION, message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(ErrorType.AUTH, message);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(ErrorType.FORBIDDEN, message);
    }

    public static ApiException rateLimited(String message) {
        return new ApiException(ErrorType.RATE_LIMITED, message);
    }

    public static ApiException notFound(String message) {
        return new ApiException(ErrorType.NOT_FOUND, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(ErrorType.CONFLICT, message);
    }

    public static ApiException notPurchasable(String message) {
        return new ApiException(ErrorType.NOT_PURCHASABLE, message);
    }

    public static ApiException providerTransient(String message, Throwable cause) {
        return new ApiException(ErrorType.PROVIDER_TRANSIENT, message, cause);
    }

    public static ApiException providerPermanent(String message, Throwable cause) {
        return new ApiException(ErrorType.PROVIDER_PERMANENT, message, cause);
    }
}
