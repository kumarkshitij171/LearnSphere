package com.lms.order_service.repository;

import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.entity.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    Optional<Order> findByTenantIdAndUserIdAndIdempotencyKey(String tenantId, String userId, String idempotencyKey);

    Optional<Order> findFirstByTenantIdAndUserIdAndCourseIdAndStatusIn(
            String tenantId, String userId, String courseId, Collection<OrderStatus> statuses);

    Optional<Order> findByIdAndTenantId(UUID id, String tenantId);

    Page<Order> findByTenantIdAndUserIdOrderByCreatedAtDesc(String tenantId, String userId, Pageable page);

    @Query("""
            select o from PurchaseOrder o
            where o.tenantId = :tenantId
              and (:status is null or o.status = :status)
              and (:userId is null or o.userId = :userId)
              and (:courseId is null or o.courseId = :courseId)
              and (:email = '' or lower(o.userEmail) like concat('%', :email, '%'))
            order by o.createdAt desc""")
    Page<Order> search(@Param("tenantId") String tenantId, @Param("status") OrderStatus status,
                       @Param("userId") String userId, @Param("courseId") String courseId,
                       @Param("email") String email, Pageable page);

    @Query("""
            select o.id from PurchaseOrder o
            where o.status in :active
              and (o.expiresAt < :now or (o.status = com.lms.order_service.models.domain.OrderStatus.PENDING
                                          and o.updatedAt < :staleBefore))
            order by o.expiresAt""")
    List<UUID> findReconciliationCandidates(@Param("active") Collection<OrderStatus> active, @Param("now") Instant now,
                                            @Param("staleBefore") Instant staleBefore, Pageable page);

    // a sweeper replica skips an order another replica (or a webhook) is holding
    @Query(value = "SELECT * FROM orders.orders WHERE id = :id FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<Order> lockIfFree(@Param("id") UUID id);

    // serialises concurrent webhooks for one order: both would otherwise read PENDING
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from PurchaseOrder o where o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") UUID id);
}
