package com.lms.order_service.repository;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findFirstByProviderAndProviderOrderIdOrderByCreatedAtDesc(
            PaymentProviderType provider, String providerOrderId);

    Optional<Payment> findFirstByOrderIdOrderByCreatedAtDesc(UUID orderId);

    Optional<Payment> findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(UUID orderId, Collection<PaymentStatus> statuses);
}
