package com.lms.order_service.service;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentEventType;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.domain.PaymentStatus;
import com.lms.order_service.models.domain.WebhookEventStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.provider.PaymentEvent;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.provider.PaymentSnapshot;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReconciliationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-08T10:00:00Z");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final PaymentRepository payments = mock(PaymentRepository.class);
    private final PaymentProvider provider = mock(PaymentProvider.class);
    private final PaymentEventHandler handler = mock(PaymentEventHandler.class);
    private final OrderStateMachine stateMachine = mock(OrderStateMachine.class);
    private ReconciliationService service;

    private Order order;
    private Payment payment;

    @BeforeEach
    void setUp() {
        when(provider.type()).thenReturn(PaymentProviderType.RAZORPAY);
        service = new ReconciliationService(orders, payments, new PaymentProviderRegistry(List.of(provider)),
                handler, stateMachine, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private void pendingOrder(Instant expiresAt) {
        order = Order.create("learnsphere", "u1", "a@b.c", "A", "c1", "Course", "i1", 49900, "INR",
                PaymentProviderType.RAZORPAY, "k1", expiresAt);
        order.applyTransition(OrderStatus.PENDING, NOW);
        payment = Payment.initiated(order, "order_rzp_1", "{}");
        when(orders.lockIfFree(order.getId())).thenReturn(Optional.of(order));
        when(payments.findFirstByOrderIdOrderByCreatedAtDesc(order.getId())).thenReturn(Optional.of(payment));
    }

    @Test
    void recoversALostCaptureAsTheSweeper() {
        pendingOrder(NOW.plusSeconds(60));
        when(provider.fetch(payment)).thenReturn(new PaymentSnapshot(true, PaymentStatus.CAPTURED, "pay_1", 49900, "INR"));
        when(handler.apply(eq(PaymentProviderType.RAZORPAY), any(), eq(Actor.SWEEPER))).thenAnswer(inv -> {
            order.applyTransition(OrderStatus.PAID, NOW);
            return new PaymentEventHandler.Result(WebhookEventStatus.PROCESSED, "payment captured");
        });

        assertThat(service.reconcile(order.getId())).isEqualTo(ReconciliationService.Outcome.PAID);
        ArgumentCaptor<PaymentEvent> event = ArgumentCaptor.forClass(PaymentEvent.class);
        verify(handler).apply(eq(PaymentProviderType.RAZORPAY), event.capture(), eq(Actor.SWEEPER));
        assertThat(event.getValue().type()).isEqualTo(PaymentEventType.PAYMENT_CAPTURED);
        assertThat(event.getValue().providerOrderId()).isEqualTo("order_rzp_1");
        assertThat(event.getValue().amountMinor()).isEqualTo(49900);
    }

    @Test
    void expiresAnAbandonedCheckoutTheProviderKnowsNothingAbout() {
        pendingOrder(NOW.minusSeconds(1));
        when(provider.fetch(payment)).thenReturn(PaymentSnapshot.unknown());
        assertThat(service.reconcile(order.getId())).isEqualTo(ReconciliationService.Outcome.EXPIRED);
        verify(stateMachine).transition(eq(order), eq(OrderStatus.EXPIRED), eq(Actor.SWEEPER), any());
    }

    @Test
    void leavesAnUnexpiredUnpaidOrderAlone() {
        pendingOrder(NOW.plusSeconds(60));
        when(provider.fetch(payment)).thenReturn(PaymentSnapshot.unknown());
        assertThat(service.reconcile(order.getId())).isEqualTo(ReconciliationService.Outcome.STILL_PENDING);
        verify(stateMachine, never()).transition(any(), any(), any(), any());
    }

    @Test
    void skipsAnOrderAnotherReplicaHolds() {
        pendingOrder(NOW.minusSeconds(1));
        when(orders.lockIfFree(order.getId())).thenReturn(Optional.empty());
        assertThat(service.reconcile(order.getId())).isEqualTo(ReconciliationService.Outcome.SKIPPED);
        verify(provider, never()).fetch(any());
    }
}
