package com.lms.notification_service.controller;

import com.lms.notification_service.models.context.CallerContext;
import com.lms.notification_service.models.context.CallerContextHolder;
import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.models.entity.DeadLetter;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.service.DeadLetterService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Admin only (ApiAuthFilter): the DLQ as something a person can read and act on. */
@RestController
@RequestMapping("/api/v1/admin/dead-letters")
@RequiredArgsConstructor
public class DeadLetterController {

    private final DeadLetterService service;

    @GetMapping
    public Map<String, Object> list(@RequestParam(defaultValue = "false") boolean includeReplayed,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        Page<DeadLetter> result = service.list(tenantId, includeReplayed, page, size);
        return Map.of("deadLetters", result.getContent(), "total", result.getTotalElements(), "page", result.getNumber());
    }

    @PostMapping("/{id}/replay")
    public ResponseEntity<Map<String, Object>> replay(@PathVariable String id) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        CallerContext caller = CallerContextHolder.get();
        NotificationMessage replayed = service.replay(tenantId, id, caller.internal() ? "internal" : caller.userId());
        return ResponseEntity.accepted().body(Map.of("notificationId", replayed.notificationId(),
                "channel", replayed.channels().get(0), "attempt", replayed.attempt(), "status", "QUEUED"));
    }
}
