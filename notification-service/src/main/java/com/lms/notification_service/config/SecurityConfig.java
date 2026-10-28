package com.lms.notification_service.config;

import com.lms.notification_service.security.AccessTokenVerifier;
import com.lms.notification_service.security.AuthProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;

@Configuration
public class SecurityConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public AccessTokenVerifier accessTokenVerifier(AuthProperties props, ObjectMapper objectMapper, Clock clock) {
        return new AccessTokenVerifier(props.accessTokenSecret(), objectMapper, clock);
    }
}
