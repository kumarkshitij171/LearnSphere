package com.lms.notification_service.config;

import com.lms.notification_service.channel.push.FcmAccessTokenProvider;
import com.lms.notification_service.channel.push.FcmClient;
import com.lms.notification_service.channel.push.GoogleServiceAccount;
import com.lms.notification_service.channel.push.PushSender;
import com.lms.notification_service.repository.DeviceTokenRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;

/** Wires the PUSH sender only when enabled; without it, PUSH records a PERMANENT "no sender" failure. */
@Configuration
@ConditionalOnProperty(name = "lms.notification.push.enabled", havingValue = "true")
public class PushConfig {

    @Bean
    public PushSender pushSender(PushProperties props, DeviceTokenRepository devices, ObjectMapper objectMapper,
                                 Clock clock) throws IOException {
        if (props.credentialsPath() == null || props.credentialsPath().isBlank()) {
            throw new IllegalStateException("FIREBASE_CREDENTIALS must point at a service-account JSON when push is enabled");
        }
        GoogleServiceAccount account = GoogleServiceAccount.parse(Files.readString(Path.of(props.credentialsPath())), objectMapper);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeout());
        factory.setReadTimeout(props.timeout());
        RestClient http = RestClient.builder().requestFactory(factory).build();
        FcmAccessTokenProvider tokens = new FcmAccessTokenProvider(account, http, objectMapper, clock);
        return new PushSender(new FcmClient(http, tokens, objectMapper, props.fcmBaseUrl(), account.projectId()), devices, props);
    }
}
