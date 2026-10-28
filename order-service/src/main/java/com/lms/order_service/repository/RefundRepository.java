package com.lms.order_service.repository;

import com.lms.order_service.models.domain.RefundStatus;
import com.lms.order_service.models.entity.Refund;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

    Optional<Refund> findByProviderRefundId(String providerRefundId);

    boolean existsByOrderIdAndStatus(UUID orderId, RefundStatus status);

    @Query("select coalesce(sum(r.amountMinor), 0) from Refund r where r.orderId = :orderId and r.status in :statuses")
    long sumAmount(@Param("orderId") UUID orderId, @Param("statuses") Collection<RefundStatus> statuses);

    // one grouped query for a whole page of orders, rather than one sum per row
    @Query("""
            select r.orderId, sum(r.amountMinor) from Refund r
            where r.orderId in :orderIds and r.status = com.lms.order_service.models.domain.RefundStatus.PROCESSED
            group by r.orderId""")
    List<Object[]> sumProcessedByOrder(@Param("orderIds") Collection<UUID> orderIds);
}
