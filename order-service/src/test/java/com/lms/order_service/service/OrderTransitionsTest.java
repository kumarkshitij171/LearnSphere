package com.lms.order_service.service;

import com.lms.order_service.models.domain.Actor;
import com.lms.order_service.models.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static com.lms.order_service.models.domain.Actor.*;
import static com.lms.order_service.models.domain.OrderStatus.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The spec is restated here independently of OrderTransitions, then every (from, to, actor, free)
 * combination is checked against it: an edge added or removed by accident fails this test.
 */
class OrderTransitionsTest {

    private record Edge(OrderStatus from, OrderStatus to, Actor actor, boolean free) {
    }

    private static final Set<Edge> LEGAL = Set.of(
            // paid orders
            new Edge(CREATED, PENDING, USER, false),
            new Edge(CREATED, CANCELLED, USER, false),
            new Edge(CREATED, EXPIRED, SYSTEM, false),
            new Edge(CREATED, EXPIRED, SWEEPER, false),
            new Edge(PENDING, PAID, WEBHOOK, false),
            new Edge(PENDING, PAID, SWEEPER, false),
            new Edge(PENDING, FAILED, WEBHOOK, false),
            new Edge(PENDING, FAILED, SWEEPER, false),
            new Edge(PENDING, CANCELLED, USER, false),
            new Edge(PENDING, EXPIRED, SYSTEM, false),
            new Edge(PENDING, EXPIRED, SWEEPER, false),
            new Edge(FAILED, PENDING, USER, false),
            new Edge(FAILED, CANCELLED, USER, false),
            new Edge(FAILED, EXPIRED, SYSTEM, false),
            new Edge(FAILED, EXPIRED, SWEEPER, false),
            new Edge(FAILED, PAID, WEBHOOK, false),
            new Edge(FAILED, PAID, SWEEPER, false),
            new Edge(EXPIRED, PAID, WEBHOOK, false),
            new Edge(EXPIRED, PAID, SWEEPER, false),
            new Edge(CANCELLED, PAID, WEBHOOK, false),
            new Edge(CANCELLED, PAID, SWEEPER, false),
            new Edge(PAID, REFUND_PENDING, ADMIN, false),
            new Edge(PARTIALLY_REFUNDED, REFUND_PENDING, ADMIN, false),
            new Edge(REFUND_PENDING, REFUNDED, WEBHOOK, false),
            new Edge(REFUND_PENDING, REFUNDED, SWEEPER, false),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, WEBHOOK, false),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, SWEEPER, false),
            new Edge(REFUND_PENDING, PAID, WEBHOOK, false),
            new Edge(REFUND_PENDING, PAID, SWEEPER, false),
            // the provider settled the refund in its API response
            new Edge(REFUND_PENDING, REFUNDED, SYSTEM, false),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, SYSTEM, false),
            new Edge(REFUND_PENDING, PAID, SYSTEM, false),
            // free orders: the only way SYSTEM may record PAID
            new Edge(CREATED, PAID, SYSTEM, true),
            new Edge(CREATED, PENDING, USER, true),
            new Edge(CREATED, CANCELLED, USER, true),
            new Edge(CREATED, EXPIRED, SYSTEM, true),
            new Edge(CREATED, EXPIRED, SWEEPER, true),
            new Edge(PENDING, FAILED, WEBHOOK, true),
            new Edge(PENDING, FAILED, SWEEPER, true),
            new Edge(PENDING, CANCELLED, USER, true),
            new Edge(PENDING, EXPIRED, SYSTEM, true),
            new Edge(PENDING, EXPIRED, SWEEPER, true),
            new Edge(FAILED, PENDING, USER, true),
            new Edge(FAILED, CANCELLED, USER, true),
            new Edge(FAILED, EXPIRED, SYSTEM, true),
            new Edge(FAILED, EXPIRED, SWEEPER, true),
            new Edge(PAID, REFUND_PENDING, ADMIN, true),
            new Edge(PARTIALLY_REFUNDED, REFUND_PENDING, ADMIN, true),
            new Edge(REFUND_PENDING, REFUNDED, WEBHOOK, true),
            new Edge(REFUND_PENDING, REFUNDED, SWEEPER, true),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, WEBHOOK, true),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, SWEEPER, true),
            new Edge(REFUND_PENDING, REFUNDED, SYSTEM, true),
            new Edge(REFUND_PENDING, PARTIALLY_REFUNDED, SYSTEM, true),
            // falling back from a failed refund records no new money, so the free rule does not apply
            new Edge(REFUND_PENDING, PAID, WEBHOOK, true),
            new Edge(REFUND_PENDING, PAID, SWEEPER, true),
            new Edge(REFUND_PENDING, PAID, SYSTEM, true));

    @Test
    void everyCombinationMatchesTheSpec() {
        List<String> mismatches = new ArrayList<>();
        int checked = 0;
        for (OrderStatus from : OrderStatus.values()) {
            for (OrderStatus to : OrderStatus.values()) {
                for (Actor actor : Actor.values()) {
                    for (boolean free : new boolean[]{false, true}) {
                        boolean expected = LEGAL.contains(new Edge(from, to, actor, free));
                        if (OrderTransitions.isAllowed(from, to, actor, free) != expected) {
                            mismatches.add("%s -> %s by %s (free=%s): expected %s".formatted(from, to, actor, free, expected));
                        }
                        checked++;
                    }
                }
            }
        }
        assertThat(checked).isEqualTo(9 * 9 * 5 * 2);
        assertThat(mismatches).isEmpty();
    }

    @Test
    void aClientRequestCanNeverMarkMoneyReceived() {
        for (OrderStatus from : OrderStatus.values()) {
            for (boolean free : new boolean[]{false, true}) {
                assertThat(OrderTransitions.isAllowed(from, PAID, USER, free)).isFalse();
                assertThat(OrderTransitions.isAllowed(from, PAID, ADMIN, free)).isFalse();
            }
        }
    }

    @Test
    void systemMayOnlyMarkAFreeOrderPaid() {
        assertThat(OrderTransitions.isAllowed(CREATED, PAID, SYSTEM, false)).isFalse();
        assertThat(OrderTransitions.isAllowed(CREATED, PAID, SYSTEM, true)).isTrue();
        assertThat(OrderTransitions.isAllowed(PENDING, PAID, WEBHOOK, true)).isFalse();
    }

    @Test
    void refundedIsTerminal() {
        for (OrderStatus to : OrderStatus.values()) {
            for (Actor actor : Actor.values()) {
                assertThat(OrderTransitions.isAllowed(REFUNDED, to, actor, false)).isFalse();
            }
        }
    }

    @Test
    void activeStatesMatchThePartialUniqueIndex() {
        for (OrderStatus status : OrderStatus.values()) {
            assertThat(OrderTransitions.isActive(status)).isEqualTo(status == CREATED || status == PENDING);
        }
    }
}
