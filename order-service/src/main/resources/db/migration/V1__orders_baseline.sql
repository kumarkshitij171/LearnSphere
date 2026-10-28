-- Phase 1 baseline. `refunds` arrives with Phase 6 as V2, alongside the code that writes it.

CREATE TABLE orders (
    id              uuid         PRIMARY KEY,
    tenant_id       varchar(64)  NOT NULL,
    user_id         varchar(64)  NOT NULL,
    user_email      varchar(320) NOT NULL,
    user_name       varchar(255),
    course_id       varchar(64)  NOT NULL,
    course_title    varchar(255) NOT NULL,
    instructor_id   varchar(64)  NOT NULL,
    amount_minor    bigint       NOT NULL CHECK (amount_minor >= 0),
    currency        varchar(3)   NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status          varchar(32)  NOT NULL,
    provider        varchar(32)  NOT NULL,
    idempotency_key varchar(128) NOT NULL,
    expires_at      timestamptz  NOT NULL,
    paid_at         timestamptz,
    cancelled_at    timestamptz,
    created_at      timestamptz  NOT NULL,
    updated_at      timestamptz  NOT NULL,
    version         bigint       NOT NULL DEFAULT 0
);

-- a retried request returns the same order
CREATE UNIQUE INDEX uq_order_idem ON orders (tenant_id, user_id, idempotency_key);

-- at most one live order per user per course; expiry and cancellation free the slot
CREATE UNIQUE INDEX uq_order_active ON orders (tenant_id, user_id, course_id)
    WHERE status IN ('CREATED', 'PENDING');

CREATE INDEX idx_orders_user ON orders (tenant_id, user_id, created_at DESC);
CREATE INDEX idx_orders_pending_expiry ON orders (expires_at) WHERE status IN ('CREATED', 'PENDING');

CREATE TABLE payments (
    id                  uuid         PRIMARY KEY,
    order_id            uuid         NOT NULL REFERENCES orders (id),
    provider            varchar(32)  NOT NULL,
    provider_order_id   varchar(128) NOT NULL,
    provider_payment_id varchar(128),
    status              varchar(32)  NOT NULL,
    amount_minor        bigint       NOT NULL CHECK (amount_minor >= 0),
    currency            varchar(3)   NOT NULL,
    method              varchar(32),
    error_code          varchar(64),
    error_message       varchar(512),
    checkout            jsonb,
    raw_payload         jsonb,
    created_at          timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL
);

CREATE UNIQUE INDEX uq_payment_provider_payment ON payments (provider, provider_payment_id);
CREATE INDEX idx_payments_provider_order ON payments (provider, provider_order_id);
CREATE INDEX idx_payments_order ON payments (order_id);

CREATE TABLE webhook_events (
    id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider          varchar(32)  NOT NULL,
    provider_event_id varchar(128) NOT NULL,
    event_type        varchar(64),
    signature_valid   boolean      NOT NULL,
    payload           jsonb,
    status            varchar(16)  NOT NULL,
    error             varchar(512),
    received_at       timestamptz  NOT NULL,
    processed_at      timestamptz
);

-- replay guard: a redelivered event is acknowledged and not re-applied
CREATE UNIQUE INDEX uq_webhook_event ON webhook_events (provider, provider_event_id);

CREATE TABLE outbox (
    id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type varchar(32)  NOT NULL,
    aggregate_id   varchar(64)  NOT NULL,
    topic          varchar(128) NOT NULL,
    message_key    varchar(128) NOT NULL,
    payload        jsonb        NOT NULL,
    created_at     timestamptz  NOT NULL,
    published_at   timestamptz,
    attempts       integer      NOT NULL DEFAULT 0,
    last_error     varchar(512)
);

CREATE INDEX idx_outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

-- append-only: why an order is in the state it is in
CREATE TABLE order_events (
    id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    uuid         NOT NULL REFERENCES orders (id),
    from_status varchar(32),
    to_status   varchar(32)  NOT NULL,
    reason      varchar(255) NOT NULL,
    actor       varchar(16)  NOT NULL,
    created_at  timestamptz  NOT NULL
);

CREATE INDEX idx_order_events_order ON order_events (order_id, id);
