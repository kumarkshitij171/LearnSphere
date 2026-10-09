package com.lms.notification_service.controller;

import com.lms.notification_service.kafka.NotificationProducer;
import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationMessage;
import com.lms.notification_service.models.request.SendNotificationRequest;
import com.lms.notification_service.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Synchronous entry point; it publishes onto the same topic Kafka producers use, so both paths share one pipeline. */
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationProducer notificationProducer;
    private final NotificationService notificationService;

    @PostMapping
    public ResponseEntity<Map<String, String>> send(@Valid @RequestBody SendNotificationRequest request) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        String notificationId = StringUtils.hasText(request.getNotificationId())
                ? request.getNotificationId()
                : UUID.randomUUID().toString();

        notificationProducer.publish(new NotificationMessage(
                notificationId,
                tenantId,
                request.getUserId(),
                request.getChannels(),
                request.getTemplateName(),
                request.getTarget(),
                request.getVariables(),
                0));

        return ResponseEntity.accepted().body(Map.of("notificationId", notificationId, "status", "QUEUED"));
    }

    @GetMapping("/{notificationId}")
    public ResponseEntity<List<Notification>> history(@PathVariable String notificationId) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        List<Notification> rows = notificationService.history(tenantId, notificationId);
        return rows.isEmpty() ? ResponseEntity.status(HttpStatus.NOT_FOUND).build() : ResponseEntity.ok(rows);
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<Notification>> historyForUser(@PathVariable String userId) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        return ResponseEntity.ok(notificationService.historyForUser(tenantId, userId));
    }
}
