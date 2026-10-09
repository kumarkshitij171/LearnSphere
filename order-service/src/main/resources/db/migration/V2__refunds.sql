-- Phase 6: refunds, plus the index admin search needs.

CREATE TABLE refunds (
    id                 uuid         PRIMARY KEY,
    order_id           uuid         NOT NULL REFERENCES orders (id),
    payment_id         uuid         NOT NULL REFERENCES payments (id),
    provider_refund_id varchar(128),
    amount_minor       bigint       NOT NULL CHECK (amount_minor > 0),
    status             varchar(16)  NOT NULL,
    reason             varchar(255) NOT NULL,
    requested_by       varchar(64)  NOT NULL,
    error              varchar(512),
    created_at         timestamptz  NOT NULL,
    updated_at         timestamptz  NOT NULL
);

CREATE UNIQUE INDEX uq_refund_provider ON refunds (provider_refund_id);
CREATE INDEX idx_refunds_order ON refunds (order_id);
-- at most one refund in flight per order; together with the service check this keeps the
-- refunded total from ever exceeding what was captured
CREATE UNIQUE INDEX uq_refund_one_pending ON refunds (order_id) WHERE status = 'PENDING';

CREATE INDEX idx_orders_admin_search ON orders (tenant_id, status, created_at DESC);
