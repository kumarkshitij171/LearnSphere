package com.lms.notification_service.repository;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.Notification;
import org.springframework.data.domain.Limit;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Update;

import java.util.Collection;
import java.util.List;

public interface NotificationRepository extends MongoRepository<Notification, String> {

    List<Notification> findByTenantIdAndNotificationId(String tenantId, String notificationId);

    List<Notification> findByTenantIdAndUserId(String tenantId, String userId);

    List<Notification> findByTenantIdAndUserIdAndChannelAndStatusOrderByCreatedAtDesc(
            String tenantId, String userId, ChannelType channel, NotificationStatus status, Limit limit);

    long countByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
            String tenantId, String userId, ChannelType channel, NotificationStatus status);

    // one updateMany: ?N indexes the method's parameters, past the ones the derived filter consumes
    @Update("{ '$set': { 'readAt': ?4, 'updatedAt': ?4 } }")
    long findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
            String tenantId, String userId, ChannelType channel, NotificationStatus status, long now);

    @Update("{ '$set': { 'readAt': ?5, 'updatedAt': ?5 } }")
    long findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNullAndIdIn(
            String tenantId, String userId, ChannelType channel, NotificationStatus status, Collection<String> ids,
            long now);
}
