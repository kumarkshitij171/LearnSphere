package com.lms.notification_service.service;

import com.lms.notification_service.models.domain.ChannelType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Suppresses duplicate Kafka deliveries of the same attempt. The attempt number is part of the key,
 * so a genuine retry is never mistaken for a redelivery.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class IdempotencyService {

    private final StringRedisTemplate redisTemplate;

    @Value("${lms.notification.idempotency-ttl}")
    private Duration ttl;

    public boolean claim(String tenantId, String notificationId, ChannelType channel, int attempt) {
        String key = "notif:idem:%s:%s:%s:%d".formatted(tenantId, notificationId, channel, attempt);
        try {
            return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(key, "1", ttl));
        } catch (Exception e) {
            // a Redis outage must not stop delivery; at-least-once beats not-at-all
            log.warn("Idempotency check failed for {}, proceeding without it: {}", key, e.getMessage());
            return true;
        }
    }
}
