package com.lms.notification_service.service;

import com.lms.notification_service.models.domain.ChannelType;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class IdempotencyServiceTest {

    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> ops = mock(ValueOperations.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final IdempotencyService service = new IdempotencyService(redis);

    IdempotencyServiceTest() {
        when(redis.opsForValue()).thenReturn(ops);
        ReflectionTestUtils.setField(service, "ttl", Duration.ofHours(24));
    }

    @Test
    void theFirstClaimWinsAndARedeliveryIsSuppressed() {
        String key = "notif:idem:t:n1:EMAIL:0";
        when(ops.setIfAbsent(eq(key), eq("1"), eq(Duration.ofHours(24)))).thenReturn(true, false);
        assertThat(service.claim("t", "n1", ChannelType.EMAIL, 0)).isTrue();
        assertThat(service.claim("t", "n1", ChannelType.EMAIL, 0)).isFalse();
    }

    @Test
    void aRetryHasItsOwnKey() {
        when(ops.setIfAbsent(eq("notif:idem:t:n1:EMAIL:1"), eq("1"), eq(Duration.ofHours(24)))).thenReturn(true);
        assertThat(service.claim("t", "n1", ChannelType.EMAIL, 1)).isTrue();
    }

    @Test
    void failsOpenWhenRedisIsDown() {
        when(ops.setIfAbsent(eq("notif:idem:t:n1:PUSH:0"), eq("1"), eq(Duration.ofHours(24))))
                .thenThrow(new RedisConnectionFailureException("down"));
        assertThat(service.claim("t", "n1", ChannelType.PUSH, 0)).isTrue();
    }
}
