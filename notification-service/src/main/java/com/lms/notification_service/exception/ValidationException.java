package com.lms.notification_service.exception;

import org.springframework.http.HttpStatus;

public class ValidationException extends RuntimeException implements AbstractException {

    private final int statusCode;

    public ValidationException(String message) {
        this(message, HttpStatus.BAD_REQUEST.value());
    }

    public ValidationException(String message, Integer statusCode) {
        super(message);
        this.statusCode = statusCode == null ? HttpStatus.BAD_REQUEST.value() : statusCode;
    }

    @Override
    public int getStatusCode() {
        return statusCode;
    }

    @Override
    public String getErrorMessage() {
        return getMessage();
    }
}
