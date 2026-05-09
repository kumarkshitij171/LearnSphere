package com.lms.notification_service.service;

import com.lms.notification_service.model.NotificationDocument;
import com.lms.notification_service.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;
    private final JavaMailSender mailSender;
    private final StringRedisTemplate redis;

    public NotificationService(NotificationRepository repository,
                               JavaMailSender mailSender,
                               StringRedisTemplate redis) {
        this.repository = repository;
        this.mailSender = mailSender;
        this.redis = redis;
    }

    public NotificationDocument save(String userId, String type, String title, String body, String actionUrl) {
        NotificationDocument doc = new NotificationDocument();
        doc.setUserId(userId);
        doc.setType(type);
        doc.setTitle(title);
        doc.setBody(body);
        doc.setActionUrl(actionUrl);

        NotificationDocument saved = repository.save(doc);

        // Increment unread count in Redis
        String key = "notifications:unread:" + userId;
        redis.opsForValue().increment(key);

        // Publish to Redis Pub/Sub so backend can push to WebSocket
        redis.convertAndSend("notifications", saved.getId() + ":" + userId + ":" + title);

        return saved;
    }

    public void sendEmail(String to, String subject, String htmlBody) {
        try {
            var message = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
        } catch (Exception e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage());
        }
    }

    public List<NotificationDocument> getForUser(String userId, int page, int size) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size));
    }

    public long getUnreadCount(String userId) {
        String key = "notifications:unread:" + userId;
        String val = redis.opsForValue().get(key);
        return val != null ? Long.parseLong(val) : 0;
    }

    public void markAllRead(String userId) {
        List<NotificationDocument> unread = repository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 1000));
        unread.forEach(n -> n.setRead(true));
        repository.saveAll(unread);
        redis.delete("notifications:unread:" + userId);
    }

    public void markOneRead(String notificationId) {
        repository.findById(notificationId).ifPresent(n -> {
            if (!n.isRead()) {
                n.setRead(true);
                repository.save(n);
                String key = "notifications:unread:" + n.getUserId();
                redis.opsForValue().decrement(key);
            }
        });
    }
}
