package com.lms.order_service.repository;

import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.WebhookEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookEventRepository extends JpaRepository<WebhookEvent, Long> {

    boolean existsByProviderAndProviderEventId(PaymentProviderType provider, String providerEventId);
}
