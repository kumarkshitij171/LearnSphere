package com.lms.notification_service.repository;

import com.lms.notification_service.model.NotificationDocument;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface NotificationRepository extends MongoRepository<NotificationDocument, String> {

    List<NotificationDocument> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);

    long countByUserIdAndReadFalse(String userId);

    void deleteByUserId(String userId);
}
