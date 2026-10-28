package com.lms.order_service.repository;

import com.lms.order_service.models.entity.OutboxMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OutboxRepository extends JpaRepository<OutboxMessage, Long> {

    // SKIP LOCKED lets several relay replicas drain the outbox without claiming the same row
    @Query(value = "SELECT * FROM orders.outbox WHERE published_at IS NULL ORDER BY id LIMIT :limit FOR UPDATE SKIP LOCKED",
            nativeQuery = true)
    List<OutboxMessage> lockUnpublishedBatch(@Param("limit") int limit);

    long countByPublishedAtIsNull();
}
