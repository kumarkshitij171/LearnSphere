package com.lms.notification_service.controller;

import com.lms.notification_service.models.context.CallerContext;
import com.lms.notification_service.models.context.CallerContextHolder;
import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.models.request.InboxReadRequest;
import com.lms.notification_service.service.InboxService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * The signed-in user's in-app inbox. The user comes from the access token only, so nobody can read
 * or mark another user's messages — admins included.
 */
@RestController
@RequestMapping("/api/v1/notifications/inbox")
@RequiredArgsConstructor
public class InboxController {

    private final InboxService inboxService;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "" + InboxService.DEFAULT_LIMIT) int limit) {
        String userId = CallerContextHolder.get().userId();
        if (userId == null) return noUser();
        return ResponseEntity.ok(inboxService.list(tenantId(), userId, limit));
    }

    @PostMapping("/read")
    public ResponseEntity<?> markRead(@Valid @RequestBody(required = false) InboxReadRequest request) {
        CallerContext caller = CallerContextHolder.get();
        if (caller.userId() == null) return noUser();
        long unread = inboxService.markRead(tenantId(), caller.userId(), request == null ? null : request.getIds());
        return ResponseEntity.ok(Map.of("unread", unread));
    }

    private static String tenantId() {
        return NotificationContextHolder.getNotificationContext().tenantId();
    }

    // the internal key identifies a service, not a person: there is no inbox to show it
    private static ResponseEntity<Map<String, Object>> noUser() {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("success", false, "message", "A user token is required to read the inbox"));
    }
}
