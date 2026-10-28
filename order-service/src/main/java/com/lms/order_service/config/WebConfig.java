package com.lms.order_service.config;

import com.lms.order_service.filters.AccessTokenVerifier;
import com.lms.order_service.filters.JwtAuthenticationFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.time.Clock;
import java.util.List;

@Configuration
public class WebConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public AccessTokenVerifier accessTokenVerifier(AuthProperties props, ObjectMapper objectMapper, Clock clock) {
        return new AccessTokenVerifier(props.accessTokenSecret(), objectMapper, clock);
    }

    // Order 0, ahead of the JWT filter: a 401 without CORS headers is unreadable to the browser,
    // and the frontend's refresh-on-401 would never fire.
    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter(@Value("${lms.cors.allowed-origins}") List<String> origins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "Authorization", "X-Tenant-Id"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/**", config);
        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(0);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtAuthenticationFilter(
            AccessTokenVerifier verifier, AuthProperties authProperties, OrderProperties orderProperties) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration =
                new FilterRegistrationBean<>(new JwtAuthenticationFilter(verifier, authProperties, orderProperties));
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(1);
        return registration;
    }
}
