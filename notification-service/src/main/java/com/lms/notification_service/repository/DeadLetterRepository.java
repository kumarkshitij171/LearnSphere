package com.lms.notification_service.repository;

import com.lms.notification_service.models.entity.DeadLetter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface DeadLetterRepository extends MongoRepository<DeadLetter, String> {

    Page<DeadLetter> findByTenantIdAndReplayedAtIsNullOrderByCreatedAtDesc(String tenantId, Pageable page);

    Page<DeadLetter> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable page);

    Optional<DeadLetter> findByIdAndTenantId(String id, String tenantId);

    long countByReplayedAtIsNull();
}
