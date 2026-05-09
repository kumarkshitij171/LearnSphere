package com.lms.notification_service.exception.handlers;

import com.lms.notification_service.exception.AbstractException;
import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.utils.CommonUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.function.Supplier;

@RestControllerAdvice
public class GlobalExceptionHandler {

    public ResponseEntity<String> genericExceptionHandler(final AbstractException exception, final Supplier<ResponseEntity<String>> runner){
        if(CommonUtils.isNotEmpty(exception.getErrorMessage())){
            return ResponseEntity.status(exception.getStatusCode()).body(exception.getErrorMessage());
        }
//        return ResponseEntity.badRequest().body(exception.getErrorMessage());
        return runner.get();
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<String> handleResourceNotFoundException(ResourceNotFoundException exception) {
        return genericExceptionHandler(
                exception,
                ()-> ResponseEntity.status(HttpStatus.NOT_FOUND).body(exception.getErrorMessage())
        );
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<String> handleValidationException(ValidationException exception) {
        return genericExceptionHandler(
                exception,
                ()-> ResponseEntity.status(HttpStatus.NOT_FOUND).body(exception.getErrorMessage())
        );
    }

}
