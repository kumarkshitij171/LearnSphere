package com.lms.notification_service.repository;

import com.lms.notification_service.models.entity.DeviceToken;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceTokenRepository extends MongoRepository<DeviceToken, String> {

    Optional<DeviceToken> findByToken(String token);

    List<DeviceToken> findByTenantIdAndUserIdAndActiveIsTrue(String tenantId, String userId);
}
