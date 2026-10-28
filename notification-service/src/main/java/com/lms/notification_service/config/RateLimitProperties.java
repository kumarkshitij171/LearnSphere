package com.lms.notification_service.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Map;

/**
 * Two windows (SYSTEM_DESIGN.md §8): per (tenant, channel) to stay inside provider quotas, and per
 * (user, template) so a producer bug cannot mail one person two hundred times.
 */
@ConfigurationProperties("lms.notification.rate-limit")
public record RateLimitProperties(boolean enabled, Duration channelWindow, Map<String, Integer> perChannel,
                                  Duration userWindow, int perUserTemplate) {

    public int channelLimit(String channel) {
        return perChannel == null ? Integer.MAX_VALUE : perChannel.getOrDefault(channel.toLowerCase(), Integer.MAX_VALUE);
    }
}
