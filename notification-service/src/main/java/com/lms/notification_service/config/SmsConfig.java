package com.lms.notification_service.config;

import com.lms.notification_service.channel.sms.SmsSender;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/** Without it, SMS records a PERMANENT "no sender registered" failure — the designed behaviour. */
@Configuration
@ConditionalOnProperty(name = "lms.notification.sms.enabled", havingValue = "true")
public class SmsConfig {

    @Bean
    public SmsSender smsSender(SmsProperties props, ObjectMapper objectMapper) {
        for (String[] required : new String[][]{{props.accountSid(), "TWILIO_ACCOUNT_SID"},
                {props.authToken(), "TWILIO_AUTH_TOKEN"}, {props.from(), "TWILIO_FROM"}}) {
            if (required[0] == null || required[0].isBlank()) {
                throw new IllegalStateException(required[1] + " must be set when SMS is enabled");
            }
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.timeout());
        factory.setReadTimeout(props.timeout());
        return new SmsSender(RestClient.builder().requestFactory(factory).build(), props, objectMapper);
    }
}
