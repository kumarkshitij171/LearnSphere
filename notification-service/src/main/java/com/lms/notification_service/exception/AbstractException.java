package com.lms.notification_service.exception;

public interface AbstractException {

    int getStatusCode();

    String getErrorMessage();
}
