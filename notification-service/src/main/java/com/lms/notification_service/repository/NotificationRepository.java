package com.lms.notification_service.repository;

import com.lms.notification_service.models.entity.Notification;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface NotificationRepository extends MongoRepository<Notification, String> {

    List<Notification> findByTenantIdAndNotificationId(String tenantId, String notificationId);

    List<Notification> findByTenantIdAndUserId(String tenantId, String userId);
}
