package com.lms.notification_service.service;

import com.lms.notification_service.config.RateLimitProperties;
import com.lms.notification_service.models.domain.ChannelType;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RateLimitServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final RateLimitProperties props = new RateLimitProperties(true, Duration.ofMinutes(1),
            Map.of("email", 300, "push", 1000), Duration.ofMinutes(10), 5);
    private final RateLimitService service = new RateLimitService(redis, props, Clock.fixed(NOW, ZoneOffset.UTC));

    @SuppressWarnings("unchecked")
    private void redisAnswers(Long channelWindow, Long userWindow) {
        when(redis.execute(any(RedisScript.class), eq(List.of("notif:rl:channel:t1:EMAIL")), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(channelWindow);
        when(redis.execute(any(RedisScript.class), eq(List.of("notif:rl:user:t1:u1:order-receipt")), anyString(), anyString(), anyString(), anyString()))
                .thenReturn(userWindow);
    }

    @Test
    void allowsWithinBothWindowsAndPassesTheWindowAndLimitToTheScript() {
        redisAnswers(1L, 1L);
        assertThat(service.check("t1", ChannelType.EMAIL, "u1", "order-receipt")).isNull();
        verify(redis).execute(any(RedisScript.class), eq(List.of("notif:rl:channel:t1:EMAIL")),
                eq(String.valueOf(NOW.toEpochMilli())), eq("60000"), eq("300"), anyString());
        verify(redis).execute(any(RedisScript.class), eq(List.of("notif:rl:user:t1:u1:order-receipt")),
                eq(String.valueOf(NOW.toEpochMilli())), eq("600000"), eq("5"), anyString());
    }

    @Test
    void theTenantChannelQuotaIsCheckedFirst() {
        redisAnswers(0L, 1L);
        assertThat(service.check("t1", ChannelType.EMAIL, "u1", "order-receipt")).contains("EMAIL quota");
    }

    @Test
    void oneUserGettingTheSameTemplateTooOftenIsLimited() {
        redisAnswers(1L, 0L);
        assertThat(service.check("t1", ChannelType.EMAIL, "u1", "order-receipt")).contains("sent to this user too often");
    }

    @Test
    @SuppressWarnings("unchecked")
    void failsOpenWhenRedisIsDown() {
        when(redis.execute(any(RedisScript.class), any(List.class), anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new RedisConnectionFailureException("down"));
        assertThat(service.check("t1", ChannelType.EMAIL, "u1", "order-receipt")).isNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    void disabledMeansNoRedisCallsAtAll() {
        RateLimitService off = new RateLimitService(redis, new RateLimitProperties(false, Duration.ofMinutes(1), Map.of(),
                Duration.ofMinutes(1), 5), Clock.systemUTC());
        assertThat(off.check("t1", ChannelType.EMAIL, "u1", "x")).isNull();
        verify(redis, never()).execute(any(RedisScript.class), any(List.class), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void theScriptTrimsCountsThenAddsAtomically() {
        // the one guarantee a Lua script gives that separate commands would not
        assertThat(RateLimitService.SLIDING_WINDOW).containsSubsequence("ZREMRANGEBYSCORE", "ZCARD", "ZADD", "PEXPIRE");
    }
}
