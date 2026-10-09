package com.lms.notification_service.controller;

import com.lms.notification_service.models.context.CallerContext;
import com.lms.notification_service.models.context.CallerContextHolder;
import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.models.entity.DeviceToken;
import com.lms.notification_service.models.request.DeviceRegisterRequest;
import com.lms.notification_service.repository.DeviceTokenRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * FCM registration tokens, registered by the browser after sign-in. A caller acts only for
 * themselves; an admin may read or remove anyone's.
 */
@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceTokenRepository deviceTokenRepository;

    @PostMapping
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody DeviceRegisterRequest request) {
        CallerContext caller = CallerContextHolder.get();
        if (caller.userId() == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("success", false, "message", "A user token is required to register a device"));
        }
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        // a token moves with the browser: re-registering under a new user re-assigns it
        DeviceToken device = deviceTokenRepository.findByToken(request.getToken())
                .orElseGet(() -> {
                    DeviceToken created = new DeviceToken();
                    created.setToken(request.getToken());
                    created.entityCreate();
                    return created;
                });
        device.setTenantId(tenantId);
        device.setUserId(caller.userId());
        device.setPlatform(request.getPlatform());
        device.setActive(true);
        device.entityUpdate();
        DeviceToken saved = deviceTokenRepository.save(device);
        return ResponseEntity.ok(Map.of("success", true, "device", Map.of(
                "id", saved.getId() == null ? "" : saved.getId(), "platform", saved.getPlatform(), "active", saved.isActive())));
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<DeviceToken>> forUser(@PathVariable String userId) {
        CallerContext caller = CallerContextHolder.get();
        if (!caller.isAdmin() && !userId.equals(caller.userId())) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        return ResponseEntity.ok(deviceTokenRepository.findByTenantIdAndUserIdAndActiveIsTrue(tenantId, userId));
    }

    /** Sign-out on a device: stop pushing to it. 204 either way, so a token's owner is not revealed. */
    @DeleteMapping("/{token}")
    public ResponseEntity<Void> deactivate(@PathVariable String token) {
        CallerContext caller = CallerContextHolder.get();
        deviceTokenRepository.findByToken(token)
                .filter(device -> caller.isAdmin() || device.getUserId().equals(caller.userId()))
                .ifPresent(device -> {
                    device.setActive(false);
                    device.entityUpdate();
                    deviceTokenRepository.save(device);
                });
        return ResponseEntity.noContent().build();
    }
}
