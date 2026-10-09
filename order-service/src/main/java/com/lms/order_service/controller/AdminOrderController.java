package com.lms.order_service.controller;

import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.context.OrderContextHolder;
import com.lms.order_service.models.domain.OrderStatus;
import com.lms.order_service.models.entity.Order;
import com.lms.order_service.models.request.RefundRequest;
import com.lms.order_service.models.response.OrderPage;
import com.lms.order_service.models.response.OrderResponse;
import com.lms.order_service.service.OrderService;
import com.lms.order_service.service.RefundService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Support tooling: search orders, issue full or partial refunds. ADMIN only. */
@RestController
@RequestMapping("/api/v1/admin/orders")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderService orderService;
    private final RefundService refundService;

    @GetMapping
    public OrderPage search(@RequestParam(required = false) OrderStatus status,
                            @RequestParam(required = false) String userId,
                            @RequestParam(required = false) String courseId,
                            @RequestParam(required = false) String email,
                            @RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "20") int size) {
        return orderService.search(admin(), status, userId, courseId, email, page, size);
    }

    @PostMapping("/{orderId}/refund")
    public OrderResponse refund(@PathVariable UUID orderId, @Valid @RequestBody RefundRequest request) {
        Order order = refundService.request(orderId, request.amountMinor(), request.reason(), admin());
        return orderService.toResponse(order, null);
    }

    private static OrderContext admin() {
        OrderContext ctx = OrderContextHolder.require();
        if (!ctx.isAdmin()) throw ApiException.forbidden("Admin access required");
        return ctx;
    }
}
