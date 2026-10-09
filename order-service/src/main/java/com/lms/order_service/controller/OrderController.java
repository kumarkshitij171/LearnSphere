package com.lms.order_service.controller;

import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.context.OrderContextHolder;
import com.lms.order_service.models.request.CreateOrderRequest;
import com.lms.order_service.models.response.OrderPage;
import com.lms.order_service.models.response.OrderResponse;
import com.lms.order_service.provider.PaymentProviderRegistry;
import com.lms.order_service.service.CreateOrderResult;
import com.lms.order_service.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final PaymentProviderRegistry registry;

    /** 201 for a new order; 200 when an existing one answers the request (same key, or already live). */
    @PostMapping
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        OrderContext ctx = OrderContextHolder.require();
        CreateOrderResult result = orderService.create(request, ctx);
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
                .body(orderService.toResponse(result.order(), result.payment()));
    }

    @GetMapping
    public OrderPage history(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return orderService.history(OrderContextHolder.require(), page, size);
    }

    /** Which providers this deployment accepts, so the frontend never offers a disabled one. */
    @GetMapping("/providers")
    public Map<String, Object> providers() {
        return Map.of("providers", registry.enabled());
    }

    @PostMapping("/{orderId}/cancel")
    public OrderResponse cancel(@PathVariable UUID orderId) {
        CreateOrderResult result = orderService.cancel(orderId, OrderContextHolder.require());
        return orderService.toResponse(result.order(), result.payment());
    }

    @PostMapping("/{orderId}/retry")
    public OrderResponse retry(@PathVariable UUID orderId) {
        CreateOrderResult result = orderService.retry(orderId, OrderContextHolder.require());
        return orderService.toResponse(result.order(), result.payment());
    }

    /** The polling endpoint the buy button watches after checkout. */
    @GetMapping("/{orderId}")
    public OrderResponse get(@PathVariable UUID orderId) {
        return orderService.get(orderId, OrderContextHolder.require());
    }
}
