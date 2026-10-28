# CLAUDE.md — order-service

Spring Boot / Java service that owns the commercial transaction: orders,
payments, refunds, and the purchase→enrolment link. Port `8086`. Read the root
`CLAUDE.md` alongside this file — in particular **Ways of Working**: HLD and LLD
are discussed and agreed before implementation, and implementation lands in
numbered phases.

## Read `SYSTEM_DESIGN.md` first

`SYSTEM_DESIGN.md` in this folder is the **plan of record** — architecture,
decisions and their rationale, state machines, contracts, data model, and the
numbered phase plan. Consult it before changing anything here, and update it
when a design decision changes.

Work proceeds phase by phase per its Part III. **Phases 1–6 are built and all 54 tests
pass** (`./mvnw clean test`), including `OrderFlowIntegrationTest` on Testcontainers, which
skips itself when Docker is not running. A mock purchase has been run end to end on local
infra; a test-mode Razorpay purchase has not. Observability (§12.6) is still owed
before real money. Circuit breakers and bulkheads are designed in Part IV, not built.

Two traps that bit this service, both now fixed — keep them fixed:

- **Ids are assigned in code**, so entities implement `Persistable` (`AbstractEntity`).
  Without it every first `save` is a `merge` into a copy, and later changes to the
  original instance — the `PENDING` transition — are silently dropped.
- **Native queries must name the schema** (`orders.outbox`). `hibernate.default_schema`
  does not apply to native SQL; it only worked while the JDBC URL set `currentSchema`.

If a test fails with "Unresolved compilation problems", the IDE's Java extension has
written stale classes into `target/` — run `./mvnw clean test`.

Wider context: `../ARCHITECTURE.md`, `../DATABASE_DESIGN.md`.

## Stack

Java 21 / Spring Boot 4.0.3 / package `com.lms.order_service`, aligned with
`notification-service`. Jackson is **3** (`tools.jackson.databind`), the Boot 4
default — annotations stay in `com.fasterxml.jackson.annotation`. Flyway needs
`spring-boot-starter-flyway` in Boot 4, not just `flyway-core`. Dependency notes
in `SYSTEM_DESIGN.md` §14.1.

Local secrets go in `order-service/.env` (gitignored, imported by
`spring.config.import`); copy `.env.sample`. `ACCESS_TOKEN_SECRET` and
`INTERNAL_API_KEY` must match `backend/.env`, or every request is a 401 and
every order a 500.

## Commands

```
./mvnw spring-boot:run      # run, or `make order` from the repo root
./mvnw test
./mvnw compile
./mvnw clean package
```

Infra first: `docker compose up -d` from the repo root supplies Postgres
(`5434`), Kafka (`9092`) and Redis (`6379`). Kafka UI on `8080`.

## The rules that carry this service

These are not style preferences. Each one is the difference between a payment
integration that works and one that loses money.

- **Never open the application database.** This service owns the Postgres schema
  `orders` and nothing else. Course data arrives over one HTTP call
  (`CatalogueClient` → `GET /api/v1/internal/courses/:id`); enrolment is granted
  by the catalogue owner consuming `order.paid`. There is no connection string
  to `public`, and adding one would move the `Enrollment` invariants into a
  service that does not own them.
- **The webhook is the only thing that can mark money as received.** A browser
  callback tells the UI to start polling; it never advances an order.
  `PENDING → PAID` is reachable only from a signature-verified webhook or from
  the reconciliation sweeper reading the provider's own API.
- **Verify the signature against the raw request body, before writing anything.**
  The controller takes `@RequestBody String`. Letting Jackson parse and
  re-serialise changes the bytes the provider signed.
- **Return `200` for anything already handled.** A `5xx` makes the provider
  retry, which is right only for genuinely transient failures. An unknown event
  type or an order already `PAID` is a success.
- **`SELECT … FOR UPDATE` the order row inside the webhook transaction.** Two
  events can arrive milliseconds apart; without the lock both read `PENDING` and
  both try to transition.
- **Every state transition goes through `OrderStateMachine`** and appends an
  `order_events` row with `from`, `to`, `reason` and `actor`. That table is the
  answer to "why is this order in this state", asked at 2am.
- **Never publish to Kafka inside the transaction.** Write an `outbox` row in the
  same transaction and let the relay publish it. A Postgres commit and a Kafka
  publish cannot be atomic, and "PAID but nobody was told" must be impossible.
- **The amount never comes from the client.** It comes from the catalogue, and
  the captured amount is re-checked against the order. A mismatch is a hard
  failure and an alert, not a silent accept.
- **Money is `bigint` minor units plus an ISO 4217 code.** Never a float, never a
  bare number. Conversion happens once, at the catalogue boundary.
- **Correctness lives in Postgres constraints, never in Redis.** Redis is for
  rate limiting and sweeper leader election only. A Redis outage must not be able
  to produce a double charge.

## The extensibility hinge — do not bypass it

Everything provider-specific sits behind `provider/PaymentProvider`:

```java
PaymentProviderType type();
CheckoutSession     createCheckout(Order order);
WebhookVerification verify(String rawBody, Map<String,String> headers);
List<PaymentEvent>  parse(WebhookVerification verified);
PaymentSnapshot     fetch(String providerPaymentId);
RefundResult        refund(Payment payment, long amountMinor, String reason);
```

`PaymentProviderRegistry` collects Spring's injected `List<PaymentProvider>`
into an `EnumMap` — deliberately the same shape as `notification-service`'s
`ChannelSenderRegistry`. The order logic only ever asks the registry for a
provider; it never references a concrete one.

**Adding a provider is exactly three things**: a `@Component` implementing the
interface and annotated `@ConditionalOnProperty` on its own enable flag,
credentials in `application.properties`, and an enum constant. Nothing in the
state machine, the controllers, the schema or any consumer changes. **If adding
a provider requires touching `OrderService`, the abstraction is being bypassed —
reconsider.** Stripe (Phase 5) is the test of this: if it touches anything
outside `provider/stripe/`, config and one enum constant, the seam was wrong.

`PaymentProviderType` carries constants for providers not yet implemented, so a
client can ask for one and get a clean `400 provider not enabled` rather than a
crash.

Nothing downstream of `parse()` knows which provider a payment came from — it
sees only the normalised `PaymentEvent`.

## Conventions

- **Multi-tenant from day one.** `tenant_id` on every row and `tenantId` on
  every event, matching `notification-service`. The `X-Tenant-Id` header
  defaults to `learnsphere` in the filter so the frontend need not care yet.
- **Flyway, never `ddl-auto`.** `spring.jpa.hibernate.ddl-auto=validate`. The
  money tables are the last place to want a schema inferred at boot.
- **Exceptions implement `AbstractException`**, rendered by a
  `@RestControllerAdvice` `GlobalExceptionHandler` — the same pattern as
  `notification-service`. Webhook responses deliberately do **not** follow the
  error table; see `SYSTEM_DESIGN.md` §7.1.
- **Request context in a `ThreadLocal`** (`OrderContextHolder`), cleared in a
  `finally` so a pooled thread cannot leak one tenant's id into another request.
- **Fail fast on missing config.** No `ACCESS_TOKEN_SECRET` or
  `INTERNAL_API_KEY` means do not start. A service that boots without them looks
  healthy and rejects every request.
- **This service verifies JWTs; it must never issue one.** The secret is shared
  with `backend`, so that is enforced by convention rather than by the
  algorithm — which is the honest weakness of HS256 here, and why RS256 + JWKS
  is the recorded migration.
- **Published contracts are additive-only.** `order.paid`, `order.failed`,
  `order.refunded` and the `NotificationMessage` envelope: new optional fields
  are fine, renaming or removing one is a breaking change for every consumer.

## Tests

Unit tests under `src/test/java` (state machine, token verifier, mock
signatures, registry) plus `OrderFlowIntegrationTest`, which needs Docker. This
is the service that can lose money, so it is the wrong place to continue the
project's no-tests pattern. `SYSTEM_DESIGN.md` §15 has the plan; the non-negotiable parts
are `OrderStateMachine` asserted over every legal and illegal transition, each
provider's signature verifier against captured real payloads, and a
Testcontainers run of create → mock webhook → `PAID` → one `order.paid` on the
topic.

`MockPaymentProvider` is what makes all of that cheap — the whole chain is
testable with no gateway account and no network.

## Comments

Minimal, generic, to the point. One short line explaining *why* beats a block
restating *what*. No Javadoc on self-explanatory methods.
