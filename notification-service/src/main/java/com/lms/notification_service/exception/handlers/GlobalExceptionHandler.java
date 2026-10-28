package com.lms.notification_service.exception.handlers;

import com.lms.notification_service.exception.AbstractException;
import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.utils.CommonUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.function.Supplier;
import java.util.stream.Collectors;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    public ResponseEntity<String> genericExceptionHandler(final AbstractException exception, final Supplier<ResponseEntity<String>> runner) {
        if (CommonUtils.isNotEmpty(exception.getErrorMessage())) {
            return ResponseEntity.status(exception.getStatusCode()).body(exception.getErrorMessage());
        }
        return runner.get();
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<String> handleResourceNotFoundException(ResourceNotFoundException exception) {
        return genericExceptionHandler(
                exception,
                () -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(exception.getErrorMessage())
        );
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<String> handleValidationException(ValidationException exception) {
        return genericExceptionHandler(
                exception,
                () -> ResponseEntity.status(HttpStatus.BAD_REQUEST).body(exception.getErrorMessage())
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<String> handleBeanValidation(MethodArgumentNotValidException exception) {
        String details = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(details);
    }

    // a malformed body or query parameter is the caller's mistake, not a 500
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<String> handleUnreadableRequest(Exception exception) {
        return ResponseEntity.badRequest().body("Malformed request: " + exception.getClass().getSimpleName());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<String> handleUnexpected(Exception exception) {
        log.error("Unhandled exception", exception);
        return ResponseEntity.internalServerError().body("Internal server error");
    }

}
