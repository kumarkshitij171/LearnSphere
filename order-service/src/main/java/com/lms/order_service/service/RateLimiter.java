package com.lms.order_service.service;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/**
 * Caps order creation per user, so a scripted buy button cannot open thousands of provider orders.
 * Fails open: Redis guards throughput, never correctness, so its outage must not stop checkout.
 */
@Slf4j
@Component
public class RateLimiter {

    private final StringRedisTemplate redis;
    private final Clock clock;
    private final int perMinute;

    public RateLimiter(StringRedisTemplate redis, Clock clock,
                       @Value("${lms.order.rate-limit.per-minute}") int perMinute) {
        this.redis = redis;
        this.clock = clock;
        this.perMinute = perMinute;
    }

    public void checkOrderCreation(OrderContext ctx) {
        long minute = clock.instant().getEpochSecond() / 60;
        String key = "orders:rl:%s:%s:%d".formatted(ctx.tenantId(), ctx.userId(), minute);
        Long count;
        try {
            count = redis.opsForValue().increment(key);
            if (count != null && count == 1) redis.expire(key, Duration.ofMinutes(2));
        } catch (Exception e) {
            log.warn("Rate limiter unavailable, allowing request: {}", e.getMessage());
            return;
        }
        if (count != null && count > perMinute) {
            throw ApiException.rateLimited("Too many purchase attempts. Please wait a minute and try again.");
        }
    }
}
