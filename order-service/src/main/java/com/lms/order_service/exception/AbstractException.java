package com.lms.order_service.exception;

import com.lms.order_service.models.domain.ErrorType;

public interface AbstractException {

    ErrorType getErrorType();

    String getErrorMessage();

    default int getStatusCode() {
        return getErrorType().status().value();
    }
}
