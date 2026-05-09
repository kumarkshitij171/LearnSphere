package com.lms.notification_service.controller;

import com.lms.notification_service.model.NotificationDocument;
import com.lms.notification_service.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<NotificationDocument>> getNotifications(
            @PathVariable String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(notificationService.getForUser(userId, page, size));
    }

    @GetMapping("/user/{userId}/unread-count")
    public ResponseEntity<Map<String, Long>> unreadCount(@PathVariable String userId) {
        return ResponseEntity.ok(Map.of("count", notificationService.getUnreadCount(userId)));
    }

    @PostMapping("/user/{userId}/mark-all-read")
    public ResponseEntity<Void> markAllRead(@PathVariable String userId) {
        notificationService.markAllRead(userId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{notificationId}/read")
    public ResponseEntity<Void> markOneRead(@PathVariable String notificationId) {
        notificationService.markOneRead(notificationId);
        return ResponseEntity.ok().build();
    }
}
