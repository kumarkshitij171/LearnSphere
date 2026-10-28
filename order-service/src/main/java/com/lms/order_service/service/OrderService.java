package com.lms.order_service.service;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.entity.Payment;
import com.lms.order_service.models.request.CreateOrderRequest;
import com.lms.order_service.models.response.CheckoutResponse;
import com.lms.order_service.models.response.OrderResponse;
import com.lms.order_service.repository.OrderRepository;
import com.lms.order_service.repository.PaymentRepository;
import com.lms.order_service.repository.RefundRepository;
import com.lms.order_service.models.domain.RefundStatus;
import com.lms.order_service.models.response.OrderPage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import com.lms.order_service.utils.ConstraintViolations;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderCreationTx creationTx;
    private final OrderLifecycleService lifecycle;
    private final RateLimiter rateLimiter;
    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final RefundRepository refundRepository;
    private final ObjectMapper objectMapper;

    // NOT @Transactional: a constraint violation marks its transaction rollback-only, so the recovery
    // read has to run in a transaction of its own
    public CreateOrderResult create(CreateOrderRequest req, OrderContext ctx) {
        rateLimiter.checkOrderCreation(ctx);
        try {
            return creationTx.attemptCreate(req, ctx);
        } catch (DataIntegrityViolationException e) {
            if (!ConstraintViolations.isViolationOf(e, "uq_order_idem", "uq_order_active")) throw e;
            return creationTx.resolveExisting(req, ctx);
        }
    }

    public CreateOrderResult cancel(UUID orderId, OrderContext ctx) {
        return lifecycle.cancel(orderId, ctx);
    }

    public CreateOrderResult retry(UUID orderId, OrderContext ctx) {
        try {
            return lifecycle.retry(orderId, ctx);
        } catch (DataIntegrityViolationException e) {
            if (!ConstraintViolations.isViolationOf(e, "uq_order_active")) throw e;
            throw ApiException.conflict("You already have a checkout open for this course");
        }
    }

    /** 404 rather than 403 for someone else's order, so its existence is not confirmed. */
    @Transactional(readOnly = true)
    public OrderResponse get(UUID orderId, OrderContext ctx) {
        Order order = orderRepository.findByIdAndTenantId(orderId, ctx.tenantId())
                .filter(o -> ctx.isAdmin() || o.getUserId().equals(ctx.userId()))
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        return toResponse(order, paymentRepository.findFirstByOrderIdOrderByCreatedAtDesc(order.getId()).orElse(null));
    }

    @Transactional(readOnly = true)
    public OrderPage history(OrderContext ctx, int page, int size) {
        return toPage(orderRepository.findByTenantIdAndUserIdOrderByCreatedAtDesc(ctx.tenantId(), ctx.userId(),
                pageRequest(page, size)));
    }

    @Transactional(readOnly = true)
    public OrderPage search(OrderContext admin, OrderStatus status, String userId, String courseId, String email,
                            int page, int size) {
        // "" rather than null for "no filter": a null bound into LIKE reaches Postgres as bytea and fails
        String emailFilter = email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
        return toPage(orderRepository.search(admin.tenantId(), status, userId, courseId, emailFilter,
                pageRequest(page, size)));
    }

    public OrderResponse toResponse(Order order, Payment payment) {
        long refunded = refundRepository.sumAmount(order.getId(), List.of(RefundStatus.PROCESSED));
        return toResponse(order, payment, refunded);
    }

    private OrderPage toPage(Page<Order> orders) {
        Map<UUID, Long> refunded = new HashMap<>();
        List<UUID> ids = orders.getContent().stream().map(Order::getId).toList();
        if (!ids.isEmpty()) {
            for (Object[] row : refundRepository.sumProcessedByOrder(ids)) refunded.put((UUID) row[0], (Long) row[1]);
        }
        // history rows never offer a checkout; resuming goes through POST /orders, which replays it
        List<OrderResponse> rows = orders.getContent().stream()
                .map(o -> toResponse(o, null, refunded.getOrDefault(o.getId(), 0L)))
                .toList();
        return new OrderPage(rows, orders.getNumber(), orders.getSize(), orders.getTotalElements());
    }

    private static PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    private OrderResponse toResponse(Order order, Payment payment, long refundedMinor) {
        CheckoutResponse checkout = null;
        if (order.getStatus() == OrderStatus.PENDING && payment != null && payment.getCheckout() != null) {
            checkout = objectMapper.readValue(payment.getCheckout(), CheckoutResponse.class);
        }
        return new OrderResponse(order.getId(), order.getStatus(), order.getCourseId(), order.getCourseTitle(),
                order.getAmountMinor(), order.getCurrency(), order.getProvider(), order.getExpiresAt(),
                order.getPaidAt(), order.getCreatedAt(), refundedMinor, checkout, order.getUserId(), order.getUserEmail());
    }
}
