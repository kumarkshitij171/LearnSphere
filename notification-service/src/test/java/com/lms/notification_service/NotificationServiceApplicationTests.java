package com.lms.notification_service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

// Needs the real stack (docker compose up: Mongo, Kafka, Redis): NOTIFICATION_IT=true ./mvnw test
@SpringBootTest(properties = {"lms.auth.access-token-secret=it", "lms.auth.internal-api-key=it"})
@EnabledIfEnvironmentVariable(named = "NOTIFICATION_IT", matches = "true")
class NotificationServiceApplicationTests {

	@Test
	void contextLoads() {
	}

}
