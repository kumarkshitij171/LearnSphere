package com.lms.order_service.service;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.lms.order_service.models.domain.Actor.ADMIN;
import static com.lms.order_service.models.domain.Actor.SWEEPER;
import static com.lms.order_service.models.domain.Actor.SYSTEM;
import static com.lms.order_service.models.domain.Actor.USER;
import static com.lms.order_service.models.domain.Actor.WEBHOOK;
import static com.lms.order_service.models.domain.OrderStatus.*;

/**
 * The legal order transitions and who may cause each one (SYSTEM_DESIGN.md §5.1).
 * Pure so it can be asserted exhaustively without a database.
 */
public final class OrderTransitions {

    private static final Map<OrderStatus, Map<OrderStatus, Set<Actor>>> ALLOWED = new EnumMap<>(OrderStatus.class);

    static {
        allow(CREATED, PENDING, USER);
        allow(CREATED, PAID, SYSTEM);                 // free orders only, see isFree
        allow(CREATED, CANCELLED, USER);
        allow(CREATED, EXPIRED, SYSTEM, SWEEPER);

        allow(PENDING, PAID, WEBHOOK, SWEEPER);
        allow(PENDING, FAILED, WEBHOOK, SWEEPER);
        allow(PENDING, CANCELLED, USER);
        allow(PENDING, EXPIRED, SYSTEM, SWEEPER);

        allow(FAILED, PENDING, USER);                 // retry with a new payment attempt
        allow(FAILED, CANCELLED, USER);
        allow(FAILED, EXPIRED, SYSTEM, SWEEPER);

        // A capture that lands after the order gave up still moved money; record it rather than lose it.
        allow(FAILED, PAID, WEBHOOK, SWEEPER);
        allow(EXPIRED, PAID, WEBHOOK, SWEEPER);
        allow(CANCELLED, PAID, WEBHOOK, SWEEPER);

        allow(PAID, REFUND_PENDING, ADMIN);
        allow(PARTIALLY_REFUNDED, REFUND_PENDING, ADMIN);
        // SYSTEM: the provider settled the refund synchronously in its API response
        allow(REFUND_PENDING, REFUNDED, WEBHOOK, SWEEPER, SYSTEM);
        allow(REFUND_PENDING, PARTIALLY_REFUNDED, WEBHOOK, SWEEPER, SYSTEM);
        allow(REFUND_PENDING, PAID, WEBHOOK, SWEEPER, SYSTEM); // refund rejected by the provider
    }

    private OrderTransitions() {
    }

    private static void allow(OrderStatus from, OrderStatus to, Actor... actors) {
        ALLOWED.computeIfAbsent(from, k -> new EnumMap<>(OrderStatus.class))
                .put(to, EnumSet.of(actors[0], actors));
    }

    /**
     * Money is only ever recorded as received by a provider-backed actor; SYSTEM may mark PAID
     * solely for a zero-amount order, where no money moves at all.
     */
    public static boolean isAllowed(OrderStatus from, OrderStatus to, Actor actor, boolean free) {
        Set<Actor> actors = ALLOWED.getOrDefault(from, Map.of()).get(to);
        if (actors == null || !actors.contains(actor)) return false;
        // a refund falling back to PAID records no new money, so it is not bound by the rule above
        if (from == REFUND_PENDING) return true;
        if (to == PAID && actor == SYSTEM) return free;
        if (to == PAID) return !free;
        return true;
    }

    /** States that hold the one-live-order-per-course slot (mirrors the uq_order_active predicate). */
    public static boolean isActive(OrderStatus status) {
        return status == CREATED || status == PENDING;
    }
}
