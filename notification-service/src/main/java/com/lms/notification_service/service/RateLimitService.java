package com.lms.notification_service.service;

import com.lms.notification_service.config.RateLimitProperties;
import com.lms.notification_service.models.domain.ChannelType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * Sliding windows in Redis (a sorted set of send times per key, trimmed and counted atomically in
 * one Lua call). Fails open: Redis protects provider quotas, it never decides correctness.
 */
@Slf4j
@Service
public class RateLimitService {

    // KEYS[1] window key · ARGV: now ms, window ms, limit, unique member
    static final String SLIDING_WINDOW = """
            redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
            if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
              return 0
            end
            redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
            redis.call('PEXPIRE', KEYS[1], ARGV[2])
            return 1
            """;

    private static final DefaultRedisScript<Long> SCRIPT = new DefaultRedisScript<>(SLIDING_WINDOW, Long.class);

    private final StringRedisTemplate redis;
    private final RateLimitProperties props;
    private final Clock clock;

    public RateLimitService(StringRedisTemplate redis, RateLimitProperties props, Clock clock) {
        this.redis = redis;
        this.props = props;
        this.clock = clock;
    }

    /** @return the reason the send must wait, or null when it may go now */
    public String check(String tenantId, ChannelType channel, String userId, String templateName) {
        if (!props.enabled()) return null;
        int channelLimit = props.channelLimit(channel.name());
        if (channelLimit != Integer.MAX_VALUE
                && !allow("notif:rl:channel:%s:%s".formatted(tenantId, channel), props.channelWindow().toMillis(), channelLimit)) {
            return "rate limited: %s quota for tenant %s".formatted(channel, tenantId);
        }
        if (userId != null && templateName != null && props.perUserTemplate() > 0
                && !allow("notif:rl:user:%s:%s:%s".formatted(tenantId, userId, templateName),
                props.userWindow().toMillis(), props.perUserTemplate())) {
            return "rate limited: %s sent to this user too often".formatted(templateName);
        }
        return null;
    }

    boolean allow(String key, long windowMs, int limit) {
        try {
            Long allowed = redis.execute(SCRIPT, List.of(key), String.valueOf(clock.millis()), String.valueOf(windowMs),
                    String.valueOf(limit), UUID.randomUUID().toString());
            return allowed == null || allowed == 1L;
        } catch (RuntimeException e) {
            log.warn("Rate limiter unavailable for {}, allowing: {}", key, e.getMessage());
            return true;
        }
    }
}
