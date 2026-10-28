package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.domain.ErrorType;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.domain.RefundStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.models.entity.Refund;
import com.lms.order_service.models.event.OrderRefundedEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.provider.RefundResult;
import com.lms.order_service.repository.OrderEventRepository;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import com.lms.order_service.repository.RefundRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefundServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");
    private static final OrderContext ADMIN = new OrderContext("learnsphere", "admin-1", "a@x.com", "Admin", "ADMIN");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final RefundRepository refunds = mock(RefundRepository.class);
    private final PaymentProvider provider = mock(PaymentProvider.class);
    private final OutboxService outbox = mock(OutboxService.class);
    private final NotificationPublisher notifications = mock(NotificationPublisher.class);
    private RefundService service;
    private Order order;
    private Payment payment;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        when(provider.type()).thenReturn(PaymentProviderType.RAZORPAY);
        OrderProperties props = new OrderProperties("learnsphere", Duration.ofMinutes(15),
                new OrderProperties.Topics("order.paid", "order.failed", "order.refunded", "notifications"), 3,
                new OrderProperties.Outbox(100, 1000, Duration.ofSeconds(10)));
        service = new RefundService(orders, payments, refunds, new PaymentProviderRegistry(List.of(provider)),
                new OrderStateMachine(mock(OrderEventRepository.class), clock), outbox, notifications, props, clock);

        order = Order.create("learnsphere", "u1", "u@x.com", "U", "c1", "Course", "i1", 49900, "INR",
                PaymentProviderType.RAZORPAY, "k1", NOW.plusSeconds(900));
        order.applyTransition(OrderStatus.PAID, NOW);
        payment = Payment.initiated(order, "order_rzp", "{}");
        payment.setStatus(PaymentStatus.CAPTURED);
        payment.setProviderPaymentId("pay_1");

        when(orders.findByIdForUpdate(order.getId())).thenReturn(Optional.of(order));
        when(payments.findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(eq(order.getId()), any()))
                .thenReturn(Optional.of(payment));
        when(refunds.save(any(Refund.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private OrderRefundedEvent refundedEvent() {
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(outbox).enqueue(eq("order.refunded"), eq(order), event.capture());
        return (OrderRefundedEvent) event.getValue();
    }

    @Test
    void aFullRefundSettledSynchronouslyRefundsTheOrderAndRevokesAccess() {
        when(refunds.sumAmount(eq(order.getId()), eq(List.of(RefundStatus.PENDING, RefundStatus.PROCESSED)))).thenReturn(0L);
        when(refunds.sumAmount(eq(order.getId()), eq(List.of(RefundStatus.PROCESSED)))).thenReturn(49900L);
        when(provider.refund(payment, 49900, "duplicate purchase")).thenReturn(new RefundResult(true, "rfnd_1", true, null));

        service.request(order.getId(), null, "duplicate purchase", ADMIN);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.REFUNDED);
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.REFUNDED);
        OrderRefundedEvent event = refundedEvent();
        assertThat(event.fullRefund()).isTrue();
        assertThat(event.refundedAmountMinor()).isEqualTo(49900);
        verify(notifications).refundProcessed(order, "rfnd_1", 49900);
    }

    @Test
    void aPartialRefundKeepsAccess() {
        when(refunds.sumAmount(eq(order.getId()), eq(List.of(RefundStatus.PENDING, RefundStatus.PROCESSED)))).thenReturn(0L);
        when(refunds.sumAmount(eq(order.getId()), eq(List.of(RefundStatus.PROCESSED)))).thenReturn(10000L);
        when(provider.refund(payment, 10000, "goodwill")).thenReturn(new RefundResult(true, "rfnd_2", true, null));

        service.request(order.getId(), 10000L, "goodwill", ADMIN);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.PARTIALLY_REFUNDED);
        assertThat(refundedEvent().fullRefund()).isFalse();
    }

    @Test
    void aPendingRefundWaitsForTheWebhook() {
        when(refunds.sumAmount(eq(order.getId()), any())).thenReturn(0L);
        when(provider.refund(payment, 49900, "r")).thenReturn(new RefundResult(true, "rfnd_3", false, null));

        service.request(order.getId(), null, "r", ADMIN);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.REFUND_PENDING);
        verify(outbox, never()).enqueue(eq("order.refunded"), any(), any());
    }

    @Test
    void cannotRefundMoreThanRemains() {
        when(refunds.sumAmount(eq(order.getId()), any())).thenReturn(40000L);
        assertThatThrownBy(() -> service.request(order.getId(), 10000L, "too much", ADMIN))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getErrorType()).isEqualTo(ErrorType.VALIDATION));
        verify(provider, never()).refund(any(), anyLong(), anyString());
    }

    @Test
    void onlyOneRefundInFlight() {
        when(refunds.existsByOrderIdAndStatus(order.getId(), RefundStatus.PENDING)).thenReturn(true);
        assertThatThrownBy(() -> service.request(order.getId(), null, "again", ADMIN))
                .satisfies(e -> assertThat(((ApiException) e).getErrorType()).isEqualTo(ErrorType.CONFLICT));
    }

    @Test
    void anUnpaidOrderCannotBeRefunded() {
        order.applyTransition(OrderStatus.CANCELLED, NOW);
        assertThatThrownBy(() -> service.request(order.getId(), null, "r", ADMIN))
                .satisfies(e -> assertThat(((ApiException) e).getErrorType()).isEqualTo(ErrorType.CONFLICT));
    }

    @Test
    void aProviderRejectionIsAnErrorSoTheTransactionRollsBack() {
        when(refunds.sumAmount(eq(order.getId()), any())).thenReturn(0L);
        when(provider.refund(payment, 49900, "r")).thenReturn(new RefundResult(false, null, false, "insufficient balance"));
        assertThatThrownBy(() -> service.request(order.getId(), null, "r", ADMIN))
                .satisfies(e -> assertThat(((ApiException) e).getErrorType()).isEqualTo(ErrorType.PROVIDER_PERMANENT));
    }
}
