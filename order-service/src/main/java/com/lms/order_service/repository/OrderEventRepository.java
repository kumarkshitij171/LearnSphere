package com.lms.order_service.repository;

import com.lms.order_service.models.entity.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

    List<OrderEvent> findByOrderIdOrderByIdAsc(UUID orderId);
}
