package com.lms.order_service.models.response;

import java.util.List;

public record OrderPage(List<OrderResponse> orders, int page, int size, long total) {
}
