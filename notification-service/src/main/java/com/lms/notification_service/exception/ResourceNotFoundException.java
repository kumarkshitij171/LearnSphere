package com.lms.notification_service.exception;

public class ResourceNotFoundException extends RuntimeException implements AbstractException {

    @Override
    public String getErrorMessage() {
        return getMessage();
    }

    @Override
    public int getStatusCode() {
        return statusCode;
    }

    Integer statusCode;

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String message,Integer statusCode) {
        super(message);
        this.statusCode=statusCode;
    }

}