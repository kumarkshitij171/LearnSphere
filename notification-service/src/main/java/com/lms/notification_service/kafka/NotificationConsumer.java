package com.lms.notification_service.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lms.notification_service.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class NotificationConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationConsumer.class);

    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;

    public NotificationConsumer(NotificationService notificationService, ObjectMapper objectMapper) {
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "user.registered", groupId = "notification-service")
    public void onUserRegistered(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            String email = (String) payload.get("email");
            String name = (String) payload.get("name");

            String html = "<h2>Welcome to LMS, " + name + "!</h2><p>Your account has been created. Start learning today.</p>";
            notificationService.sendEmail(email, "Welcome to LMS!", html);
            notificationService.save(userId, "WELCOME", "Welcome!", "Your account is ready. Start learning!", null);
        } catch (Exception e) {
            log.error("Error processing user.registered: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "order.completed", groupId = "notification-service")
    public void onOrderCompleted(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            String courseId = (String) payload.get("courseId");
            Object amount = payload.get("amount");

            notificationService.save(userId, "ORDER_COMPLETED",
                    "Purchase Confirmed!",
                    "You have successfully enrolled in the course. Happy learning!",
                    "/dashboard/courses/" + courseId);
        } catch (Exception e) {
            log.error("Error processing order.completed: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "video.ready", groupId = "notification-service")
    public void onVideoReady(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            String videoId = (String) payload.get("videoId");

            notificationService.save(userId, "VIDEO_READY",
                    "Video Ready",
                    "Your video has finished processing and is ready for students!",
                    "/instructor/videos/" + videoId);
        } catch (Exception e) {
            log.error("Error processing video.ready: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "quiz.passed", groupId = "notification-service")
    public void onQuizPassed(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            Object score = payload.get("score");

            notificationService.save(userId, "QUIZ_PASSED",
                    "Quiz Passed!",
                    "Congratulations! You passed the quiz with a score of " + score + "%.",
                    null);
        } catch (Exception e) {
            log.error("Error processing quiz.passed: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "certificate.issued", groupId = "notification-service")
    public void onCertificateIssued(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            String courseId = (String) payload.get("courseId");
            String pdfUrl = (String) payload.get("pdfUrl");

            notificationService.save(userId, "CERTIFICATE_ISSUED",
                    "Certificate Earned!",
                    "Congratulations on completing the course! Your certificate is ready.",
                    pdfUrl);
        } catch (Exception e) {
            log.error("Error processing certificate.issued: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "instructor.approved", groupId = "notification-service")
    public void onInstructorApproved(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");

            notificationService.save(userId, "INSTRUCTOR_APPROVED",
                    "Instructor Application Approved!",
                    "Congratulations! You are now an approved instructor. Start creating your first course.",
                    "/instructor/dashboard");
        } catch (Exception e) {
            log.error("Error processing instructor.approved: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "instructor.rejected", groupId = "notification-service")
    public void onInstructorRejected(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String userId = (String) payload.get("userId");
            String reason = (String) payload.get("reason");

            notificationService.save(userId, "INSTRUCTOR_REJECTED",
                    "Instructor Application Update",
                    "Your instructor application was not approved. Reason: " + reason,
                    null);
        } catch (Exception e) {
            log.error("Error processing instructor.rejected: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "course.published", groupId = "notification-service")
    public void onCoursePublished(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String instructorId = (String) payload.get("instructorId");
            String courseId = (String) payload.get("courseId");

            notificationService.save(instructorId, "COURSE_PUBLISHED",
                    "Course Published!",
                    "Your course has been reviewed and is now live for students.",
                    "/courses/" + courseId);
        } catch (Exception e) {
            log.error("Error processing course.published: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "course.rejected", groupId = "notification-service")
    public void onCourseRejected(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> payload = parse(record.value());
            String instructorId = (String) payload.get("instructorId");
            String courseId = (String) payload.get("courseId");
            String feedback = (String) payload.get("feedback");

            notificationService.save(instructorId, "COURSE_REJECTED",
                    "Course Review Update",
                    "Your course needs revisions: " + feedback,
                    "/instructor/courses/" + courseId);
        } catch (Exception e) {
            log.error("Error processing course.rejected: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String json) throws Exception {
        return objectMapper.readValue(json, Map.class);
    }
}
