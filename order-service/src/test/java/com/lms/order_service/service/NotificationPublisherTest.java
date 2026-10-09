package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.event.NotificationMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class NotificationPublisherTest {

    private final OutboxService outbox = mock(OutboxService.class);
    private final OrderProperties props = new OrderProperties("learnsphere", Duration.ofMinutes(15),
            new OrderProperties.Topics("order.paid", "order.failed", "order.refunded", "notifications"), 3,
            new OrderProperties.Outbox(100, 1000, Duration.ofSeconds(10)));
    private final NotificationPublisher publisher = new NotificationPublisher(outbox, props);

    private static Order order(long amount, String name) {
        return Order.create("learnsphere", "u1", "student@example.com", name, "c1", "Kafka for Beginners",
                "i1", amount, "INR", PaymentProviderType.MOCK, "k1", Instant.now().plusSeconds(900));
    }

    private NotificationMessage captured() {
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(outbox).enqueue(eq("notifications"), any(Order.class), event.capture());
        return (NotificationMessage) event.getValue();
    }

    @Test
    void receiptMatchesTheNotificationContractAndIsIdempotentPerOrder() {
        Order order = order(49900, "Asha");
        publisher.receipt(order, "pay_1");
        NotificationMessage message = captured();

        assertThat(message.notificationId()).isEqualTo(order.getId() + ":receipt");
        assertThat(message.templateName()).isEqualTo("order-receipt");
        assertThat(message.channels()).containsExactly("EMAIL");
        assertThat(message.target().email()).isEqualTo("student@example.com");
        assertThat(message.userId()).isEqualTo("u1");
        assertThat(message.attempt()).isZero();
        assertThat(message.variables())
                .containsEntry("name", "Asha")
                .containsEntry("amount", "₹499.00")
                .containsEntry("paymentId", "pay_1")
                .containsEntry("courseTitle", "Kafka for Beginners")
                .containsKeys("orderId", "purchasedAt");
    }

    @Test
    void freeReceiptsSayFreeAndAMissingNameFallsBack() {
        publisher.receipt(order(0, null), null);
        NotificationMessage message = captured();
        assertThat(message.variables()).containsEntry("amount", "Free").containsEntry("name", "there")
                .containsEntry("paymentId", "—");
    }

    @Test
    void eachFailedAttemptGetsItsOwnNotification() {
        Order order = order(49900, "Asha");
        publisher.paymentFailed(order, "pay_9", "Card declined");
        NotificationMessage message = captured();
        assertThat(message.notificationId()).isEqualTo(order.getId() + ":payment-failed:pay_9");
        assertThat(message.variables()).containsEntry("reason", "Card declined");
    }
}
