package com.lms.notification_service.exception;

import org.springframework.http.HttpStatus;

public class ResourceNotFoundException extends RuntimeException implements AbstractException {

    private final int statusCode;

    public ResourceNotFoundException(String message) {
        this(message, HttpStatus.NOT_FOUND.value());
    }

    public ResourceNotFoundException(String message, Integer statusCode) {
        super(message);
        this.statusCode = statusCode == null ? HttpStatus.NOT_FOUND.value() : statusCode;
    }

    @Override
    public String getErrorMessage() {
        return getMessage();
    }

    @Override
    public int getStatusCode() {
        return statusCode;
    }

}
