package com.lms.order_service.service;

import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.domain.PaymentProviderType;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.models.event.OrderPaidEvent;
import com.lms.order_service.models.request.CreateOrderRequest;
import com.lms.order_service.provider.CheckoutSession;
import com.lms.order_service.provider.PaymentProvider;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * The transactional half of order creation. Separate from OrderService so a lost unique-index race
 * can be recovered in a fresh transaction (SYSTEM_DESIGN.md §12.1).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderCreationTx {

    static final List<OrderStatus> ACTIVE = List.of(OrderStatus.CREATED, OrderStatus.PENDING);

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final CatalogueClient catalogueClient;
    private final PaymentProviderRegistry registry;
    private final OrderStateMachine stateMachine;
    private final OutboxService outboxService;
    private final NotificationPublisher notificationPublisher;
    private final OrderProperties props;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Transactional
    public CreateOrderResult attemptCreate(CreateOrderRequest req, OrderContext ctx) {
        Instant now = clock.instant();

        // ① this exact request already succeeded: the ordinary retry, no concurrency involved
        var byKey = orderRepository.findByTenantIdAndUserIdAndIdempotencyKey(
                ctx.tenantId(), ctx.userId(), req.idempotencyKey());
        if (byKey.isPresent()) return replayByKey(byKey.get(), req);

        // ② one live order per course: resume it, unless it has quietly run past its expiry
        var live = orderRepository.findFirstByTenantIdAndUserIdAndCourseIdAndStatusIn(
                ctx.tenantId(), ctx.userId(), req.courseId(), ACTIVE);
        if (live.isPresent()) {
            Order existing = live.get();
            if (existing.getExpiresAt().isAfter(now)) return CreateOrderResult.replay(existing, latestPayment(existing));
            stateMachine.transition(existing, OrderStatus.EXPIRED, Actor.SYSTEM, "expired; buyer started a new order");
            orderRepository.saveAndFlush(existing);
        }

        CourseSnapshot course = catalogueClient.require(req.courseId());
        if (!course.published()) throw ApiException.notPurchasable("This course is not available for purchase");
        if (ctx.userId().equals(course.instructorId())) throw ApiException.conflict("You already own this course");
        // ③ the duplicate no index can see: an earlier, completed purchase
        if (catalogueClient.isEnrolled(ctx.userId(), course.id())) {
            throw ApiException.conflict("You are already enrolled in this course");
        }

        boolean free = course.amountMinor() == 0;
        PaymentProvider provider = free ? null : resolveProvider(req.provider());

        // ④ claim the slot first and flush: uq_order_idem / uq_order_active arbitrate racing requests
        //    here, before any provider-side order exists, so the loser has spent nothing
        Order order = Order.create(ctx.tenantId(), ctx.userId(), ctx.email(), ctx.name(), course.id(), course.title(),
                course.instructorId(), course.amountMinor(), course.currency(), req.provider(),
                req.idempotencyKey(), now.plus(props.ttl()));
        orderRepository.saveAndFlush(order);
        stateMachine.recordCreated(order, Actor.USER);

        if (free) {
            stateMachine.transition(order, OrderStatus.PAID, Actor.SYSTEM, "free course");
            outboxService.enqueue(props.topics().paid(), order, OrderPaidEvent.of(order, null, now));
            notificationPublisher.receipt(order, null);
            return CreateOrderResult.created(order, null);
        }

        // ⑤ only the winner of ④ ever reaches the gateway
        CheckoutSession session = createCheckout(provider, order);
        Payment payment = paymentRepository.save(
                Payment.initiated(order, session.providerOrderId(), objectMapper.writeValueAsString(session)));
        stateMachine.transition(order, OrderStatus.PENDING, Actor.USER, "checkout created");
        log.info("Order {} created for course {} via {} ({} {})", order.getId(), order.getCourseId(),
                order.getProvider(), order.getAmountMinor(), order.getCurrency());
        return CreateOrderResult.created(order, payment);
    }

    /** After losing a race: whichever order won is the answer. */
    @Transactional(readOnly = true)
    public CreateOrderResult resolveExisting(CreateOrderRequest req, OrderContext ctx) {
        var byKey = orderRepository.findByTenantIdAndUserIdAndIdempotencyKey(
                ctx.tenantId(), ctx.userId(), req.idempotencyKey());
        if (byKey.isPresent()) return replayByKey(byKey.get(), req);
        return orderRepository.findFirstByTenantIdAndUserIdAndCourseIdAndStatusIn(
                        ctx.tenantId(), ctx.userId(), req.courseId(), ACTIVE)
                .map(order -> CreateOrderResult.replay(order, latestPayment(order)))
                .orElseThrow(() -> ApiException.conflict("A concurrent purchase changed this order; please retry"));
    }

    private CreateOrderResult replayByKey(Order order, CreateOrderRequest req) {
        if (!order.getCourseId().equals(req.courseId())) {
            throw ApiException.conflict("idempotencyKey was already used for a different course");
        }
        return CreateOrderResult.replay(order, latestPayment(order));
    }

    private Payment latestPayment(Order order) {
        return paymentRepository.findFirstByOrderIdOrderByCreatedAtDesc(order.getId()).orElse(null);
    }

    private PaymentProvider resolveProvider(PaymentProviderType type) {
        if (type == PaymentProviderType.NONE) throw ApiException.validation("provider NONE is only used for free courses");
        return registry.get(type).orElseThrow(() -> ApiException.validation("Payment provider " + type + " is not enabled"));
    }

    private static CheckoutSession createCheckout(PaymentProvider provider, Order order) {
        try {
            return provider.createCheckout(order);
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {
            throw ApiException.providerTransient("The payment provider is unavailable, please try again", e);
        }
    }
}
