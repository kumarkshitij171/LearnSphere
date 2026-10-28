package com.lms.order_service.controller;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.service.WebhookOutcome;
import com.lms.order_service.service.WebhookService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Authenticated by provider signature, not by JWT; excluded from the auth filter by path. */
@RestController
@RequestMapping("/api/v1/webhooks")
@RequiredArgsConstructor
public class WebhookController {

    private final WebhookService webhookService;

    // String body: the signature covers the exact bytes, so Jackson must never re-serialise them first
    @PostMapping("/{provider}")
    public ResponseEntity<Map<String, Object>> receive(@PathVariable String provider,
                                                       @RequestBody(required = false) String rawBody,
                                                       HttpServletRequest request) {
        PaymentProviderType type = PaymentProviderType.fromPath(provider)
                .orElseThrow(() -> ApiException.notFound("Unknown payment provider " + provider));
        WebhookOutcome outcome = webhookService.handle(type, rawBody, lowerCaseHeaders(request), request.getRemoteAddr());

        Map<String, Object> body = new HashMap<>();
        body.put("received", outcome.httpStatus() == 200);
        if (outcome.status() != null) body.put("status", outcome.status());
        body.put("detail", outcome.detail());
        return ResponseEntity.status(outcome.httpStatus()).body(body);
    }

    private static Map<String, String> lowerCaseHeaders(HttpServletRequest request) {
        Map<String, String> headers = new HashMap<>();
        for (String name : Collections.list(request.getHeaderNames())) {
            headers.put(name.toLowerCase(Locale.ROOT), request.getHeader(name));
        }
        return headers;
    }
}
