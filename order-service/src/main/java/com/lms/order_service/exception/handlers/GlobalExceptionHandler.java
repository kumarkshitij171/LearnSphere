package com.lms.order_service.exception.handlers;

import com.lms.order_service.exception.AbstractException;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.ErrorType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;
import java.util.stream.Collectors;

/** Same `{ success, message }` shape backend uses, plus the error class from SYSTEM_DESIGN.md §13. */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
        if (e.getErrorType() == ErrorType.INTERNAL || e.getErrorType() == ErrorType.PROVIDER_PERMANENT) {
            log.error("{}: {}", e.getErrorType(), e.getMessage(), e);
        }
        return body(e);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleBeanValidation(MethodArgumentNotValidException e) {
        String details = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return body(ApiException.validation(details));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleUnreadable(Exception e) {
        return body(ApiException.validation("Malformed request"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception e) {
        log.error("Unhandled exception", e);
        return body(new ApiException(ErrorType.INTERNAL, "Internal server error"));
    }

    private static ResponseEntity<Map<String, Object>> body(AbstractException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of(
                "success", false,
                "error", e.getErrorType().name(),
                "message", e.getErrorMessage()));
    }
}
