# Order Service — System Design

Status: **design agreed. Phases 0–6 written and unit-tested; none of Phases 1–6
has been built with Maven or run against real infrastructure yet (§Part III).**
Phase 7 is deliberately deferred.
Owner: LearnSphere platform. Port `8086`.
Stack: **Java 21 / Spring Boot 4.0.3**, package root **`com.lms.order_service`**
— the same as `notification-service`. The scaffold was aligned to this in Phase 1.
First real provider: **Razorpay** (confirmed, §16.5); Stripe stays Phase 5.

**Decisions taken while building Phase 1** — each changes the text below, so each
is flagged for your reaction:

| # | Decision | Where |
|---|---|---|
| D1 | A capture arriving for a `FAILED`/`EXPIRED`/`CANCELLED` order moves it to `PAID` (webhook/sweeper only) instead of being ignored — the money moved | §5.1 |
| D2 | The webhook dedup row is written **in the same transaction** as the processing, so a crash cannot burn an event id | §7.1 |
| D3 | HS256 verification is ~60 lines of `javax.crypto` rather than `jjwt` | §14.1 |
| D4 | Redis and the `refunds` table are deferred to the phases that use them (rate limiting, Phase 6) | §14.1 |
| D5 | The sweeper claims each order with `FOR UPDATE SKIP LOCKED` instead of Redis leader election — any number of replicas sweep safely, and Redis stays out of anything but rate limiting | §7.3 |
| D6 | `PaymentProvider.fetch` takes the `Payment` row, not a payment id: after a lost webhook only the provider's *order* id is known | §10 |
| D7 | `SYSTEM` may complete `REFUND_PENDING` — Razorpay and Stripe often settle a refund in the API response itself | §5.1 |
| D8 | One refund in flight per order (partial unique index `uq_refund_one_pending`); pending refunds count against the refundable remainder | Phase 6 |

Per the root `CLAUDE.md` **Ways of Working**, this is the HLD and the LLD for the
commerce slice: orders, payments, and the purchase→enrolment link. Implementation
waits for your reaction, then proceeds phase by phase.

This document spans four services, because the feature does. §9 is the contract
for the changes needed in `backend/`, `notification-service/` and `frontend/`;
each of those gets the change written into its own design doc once this one is
agreed.

Wider context: `../ARCHITECTURE.md` (system boundaries, the scaling plan),
`../DATABASE_DESIGN.md` (data ownership, schema boundaries, money
representation). Diagrams: `../docs/diagrams/04-purchase-flow.eraser` and
`06-order-state-machine.eraser`, rendered in the Eraser workspace
**LearnSphere - System Architecture**.

Decisions taken from you up front: **a new Spring Boot microservice**, **several
payment providers behind one abstraction**, **producers publish ready-made
`NotificationMessage`s** (notification-service stays dumb), and **one course per
order** for v1.

---

# Part I — HLD

## 1. Purpose and scope

The service owns **the commercial transaction and nothing else**: what was
bought, for how much, by whom, whether the money actually moved, and the audit
trail proving it.

**In scope**

| Concern | Notes |
|---|---|
| Order lifecycle | create → pay → paid/failed/expired, with a guarded state machine |
| Payment attempts | one order may have several (card declined, retried on UPI) |
| Provider integration | Razorpay, Stripe, and a Mock provider, behind one interface |
| Webhook ingestion | signature verification, deduplication, replay-safety |
| Refunds | full and partial, admin-initiated |
| Financial audit | every state transition and every raw provider payload is kept |

**Explicitly out of scope**

| Concern | Owner |
|---|---|
| The course catalogue — titles, prices, publishing | the **catalogue owner**: `backend/` today, `course-service` after the split (§2.1) |
| **Entitlement — who may watch what** | the catalogue owner (`Enrollment`) |
| User identity, auth issuance, roles | `auth-service` — what `backend/` is being reduced to |
| Actually sending any email | `notification-service` |
| Video, transcoding, playback | `video-transcoder` |

**Non-goals for now.** Carts and multi-item orders, coupons and discount codes,
subscriptions or instalments, instructor payouts and revenue share, tax/GST
computation, multi-currency pricing. The data model leaves room for each — §16
records where — but nothing is built for them.

---

## 2. The one decision everything else follows from

> **order-service decides that money moved. `backend` decides who may watch a
> course. Those are two different facts, in two different stores, joined by an
> event.**

order-service **never writes `Enrollment`** and never opens a connection to the
application database. When a payment is captured it records that as its own
truth and publishes `order.paid`; `backend` consumes that and grants the
enrolment in its own schema.

The alternative — order-service writing `Enrollment` directly over the shared
Postgres — is the failure this avoids. Two services writing one table means the
table's invariants live in neither of them, a Prisma schema edit silently breaks
a Java service, and "who granted this enrolment and why" stops having an answer.
The price paid for the boundary is eventual consistency: for a few hundred
milliseconds after payment the user has paid and is not yet enrolled. §7.5 says
how the UI handles that window.

### 2.1 Service topology — and why this design does not wait for it

You are splitting `backend/` down to **auth only**, with the course domain moving
to a service of its own. That changes the map this feature lands on:

```
  today                                    target
  ─────                                    ──────
  backend/  User, auth, tokens             auth-service      User, auth, tokens
            Course, Enrollment             course-service    Course, Enrollment, Video
            Video, transcode wiring        order-service     Order, Payment, Refund
                                           notification-service
  video-transcoder                         video-transcoder
  notification-service
```

**This design is already the shape the split wants.** order-service has exactly
two dependencies on the course domain, and neither is a database:

| Dependency | Form | What the split costs |
|---|---|---|
| Course title, price, published-ness | one HTTP call behind `CatalogueClient` | change `CATALOGUE_BASE_URL` |
| Granting enrolment on payment | a Kafka consumer of `order.paid` | move ~60 lines from `backend/` to `course-service`; the event contract is unchanged |

**order-service itself changes by zero lines when the course domain moves.**
That is not luck — it is the §2 rule (order-service never opens the application
database) paying for itself early.

So the recommendation is: **build commerce now against the catalogue *contract*,
not against `backend`.** Extracting `course-service` first would delay this
feature by the whole migration and buy nothing, because the seam it would create
is the seam this design already assumes.

**The honest cost.** Phase 0 and Phase 2 (§Part III) are ~150 lines of TypeScript
that land in `backend/` today and get ported when the course domain moves. If
`course-service` is being built in the next few weeks, those two phases should be
written there instead and commerce waits on it. That is the one call this
document cannot make for you — §16.8.

Everywhere below, **"the catalogue owner" means `backend/` today and
`course-service` tomorrow.** The contracts in §9.1 are written against the
domain, not the deployment, so they survive the move unchanged.

---

## 3. Where it sits

```
  frontend (Next.js :3000)
      │
      │ ① POST /api/v1/orders { courseId, provider }     Authorization: Bearer <access_token>
      ▼
  ┌──────────────────────────────────────────────────────────┐
  │             order-service  :8086                         │
  │                                                          │
  │   OrderService ─▶ PaymentProviderRegistry ─▶ Razorpay    │──③ create provider order
  │        │                                  ─▶ Stripe      │
  │        │                                  ─▶ Mock (dev)  │
  │        ▼                                                 │
  │   Postgres schema `orders`   ·   Redis   ·   outbox      │
  └───┬──────────────────────────────────────────────┬───────┘
      │ ② GET /internal/courses/{id}  (X-Internal-Api-Key)   │
      ▼                                                      │
  catalogue owner ──────────── Postgres `public` ────────────┼───────────┐
  (backend :5000 today,                                      │           │
   course-service tomorrow)                                  │           │
      ▲                                                      │           │
      │                                                      │           │
      │            ④ browser completes provider checkout      │           │
      │            ⑤ provider POSTs webhook ─────────────────▶│           │
      │                                                      │           │
      │                        ⑥ outbox relay ──▶ Kafka      │           │
      │                                            │          │           │
      ├──── `order.paid` / `order.refunded` ◀──────┤          │           │
      │     consumer → Enrollment upsert           │          │           │
      │                                            │          │           │
      │                             `notifications`└──────────┴──▶ notification-service :8085
      │                              (NotificationMessage)              → receipt email
      │
  Postgres :5434  (one instance, two schemas: `public` = backend, `orders` = this service)
                  (`course-service` takes a third schema when it lands)
  Redis :6379     Kafka :9092
```

Every box already exists in the root `docker-compose.yml`. **No new
infrastructure** — the service reuses the Postgres instance under its own schema,
the same Kafka, the same Redis.

---

## 4. Design decisions and why

| Decision | Rationale |
|---|---|
| **Separate Spring Boot service, own schema** | Your call, and the boundary is real: commerce data has a different retention and audit profile from course content, and a payment bug should not be able to corrupt the catalogue. Mirroring `notification-service`'s stack means one set of conventions, not two. |
| **Own schema `orders` in the *existing* Postgres instance** | A separate logical boundary without a second container. Prisma's `db push` only manages `public`, so it can never touch these tables. Splitting onto its own instance later is a connection-string change. |
| **Providers behind one interface + a registry** | You asked for several. The registry is deliberately the same shape as `notification-service`'s `ChannelSenderRegistry` — `List<PaymentProvider>` injected by Spring, keyed into an `EnumMap`. Adding Stripe is one `@Component`, not a branch in the order logic. |
| **A `MockPaymentProvider` ships first** | The whole order → payment → enrolment → receipt chain is exercisable before any gateway account exists, and it stays as the test double forever. Real integrations then only have to prove *one* thing: that their webhook maps to the normalised event. |
| **The webhook is the source of truth, never the browser** | The browser can be closed mid-redirect, or lie outright. A client-side "payment succeeded" callback only tells the UI to start polling; it never advances an order. This is the single most common way toy payment integrations get money wrong. |
| **Transactional outbox, not publish-inside-the-transaction** | Postgres commit and Kafka publish cannot be atomic. Writing the event as a row in the same transaction, and relaying it after, makes "order is PAID but nobody was told" impossible. The cost is at-least-once delivery, which both consumers already tolerate (§7.2). |
| **Price is snapshotted onto the order** | What the buyer paid is a fact about a moment. An instructor editing the price next week must not rewrite the history of a completed sale. `course_title` and `instructor_id` are snapshotted for the same reason — receipts and future payouts must not depend on a row that can change or be deleted. |
| **Money as `BIGINT` minor units + ISO currency code** | Never a float. `backend`'s `Course.price` is currently `Float`, which is a real defect for money — §9.1 proposes `Decimal(10,2)`. order-service converts once at order creation and never sees a float again. |
| **Client-supplied idempotency key on order creation** | A double-clicked buy button must not create two orders, and a retried request after a network timeout must return the *same* order. |
| **Free (₹0) courses also create an order** | One purchase path, one audit trail, one enrolment granter. A free order goes `CREATED → PAID` in a single transaction with `provider = NONE` and no gateway call, and emits the same events. The alternative — a separate free path — means two ways to become enrolled and two places to get it wrong. Open for challenge (§16.1). |
| **Coupled to the catalogue *contract*, never the catalogue *service*** | `backend/` is being reduced to auth and the course domain is moving out. Because order-service reaches the catalogue only over HTTP and Kafka, that migration is a config change here rather than a rewrite (§2.1). The same property is what lets `video-transcoder` keep working through the move. |
| **Multi-tenant from day one (`tenant_id` on every row)** | `notification-service` is already built this way and the Kafka contract already carries `tenantId`. Being the one service that isn't costs more later than carrying the column costs now. |
| **Stateless JWT validation with the shared secret** | See §8.1 — the access token `backend` already issues carries `{ id, email, role }`, which is exactly what this service needs. No per-request call to `backend`, so a `backend` outage cannot stop a checkout that is already in flight. |

### Rejected

| Option | Why not |
|---|---|
| Orders inside `backend/` | Would have made payment→enrolment a single Prisma transaction, which is genuinely simpler. You chose the service boundary; this design pays the cost honestly with an outbox rather than pretending the problem is absent. |
| Separate `payment-service` *and* `order-service` | Two services that would always deploy together and always fail together. One service, two aggregates. Split when payments grow a second consumer (payouts). |
| Saga with compensation on enrolment failure | There is nothing to compensate. `order.paid` is durable in Kafka; if `backend` is down the event waits. Enrolment is a retry-until-success, not a rollback-the-payment. |
| order-service holding a read-model of the catalogue | Adds a `course.updated` consumer and a staleness class of bug, to avoid one HTTP call on a path that is already talking to a payment gateway over the internet. Revisit if order creation p99 ever matters. |

---

## 5. State machines

### 5.1 Order

```
                     ┌──────────────────────────────── cancel (user) ──┐
                     │                                                  ▼
  CREATED ──initiate──▶ PENDING ──webhook: captured──▶ PAID        CANCELLED
     │                     │                            │
     │                     ├──webhook: failed──▶ FAILED │
     │                     │                            │
     └──── sweeper: past expires_at ──▶ EXPIRED ◀───────┘ (never)
                                                        │
                                   admin refund ────────┤
                                                        ▼
                              REFUND_PENDING ──▶ REFUNDED | PARTIALLY_REFUNDED
```

Rules enforced in one place (`OrderStateMachine`), not scattered across handlers:

- `PENDING → PAID` is reachable **only** from a signature-verified webhook or
  from the reconciliation sweeper reading the provider's own API. Never from a
  client request.
- `PAID` is terminal except for the refund branch.
- `FAILED` is **not** terminal for the *order* — the buyer may retry, which
  creates a new `payments` row against the same order and returns it to
  `PENDING`. Orders are cheap; making the user re-pick the course is not.
- Every transition appends an `order_events` row (`from`, `to`, `reason`,
  `actor` ∈ `USER | WEBHOOK | SWEEPER | ADMIN | SYSTEM`). This table is the
  answer to "why is this order in this state", asked at 2am.
- **Late capture (D1).** A signature-verified capture for an order that is
  already `FAILED`, `EXPIRED` or `CANCELLED` still moves it to `PAID`, with the
  reason `late capture after <state>` and a `WARN` log. The buyer paid at minute 16
  of a 15-minute order, or the gateway retried a decline into a success; either
  way the money is real, and ignoring it would leave a charge nobody can see.
  Only `WEBHOOK` and `SWEEPER` may take these edges. **Known gap:** if the buyer
  had meanwhile started and paid a *second* order for the same course, both are
  now `PAID` and one needs refunding by hand — a second capture on an already-paid
  order is logged `ALERT duplicate capture` for exactly this. Automating that
  refund belongs with Phase 6.
- `SYSTEM` may record `PAID` only for a zero-amount order; `USER` and `ADMIN`
  never can. The full matrix lives in `service/OrderTransitions.java` and is
  asserted combination-by-combination in `OrderTransitionsTest`.

### 5.2 Payment

```
  INITIATED ──▶ AUTHORIZED ──▶ CAPTURED ──▶ (REFUNDED | PARTIALLY_REFUNDED)
      │              │
      └──────────────┴──▶ FAILED
```

Razorpay and Stripe both support authorise-then-capture and auto-capture. v1
uses **auto-capture** everywhere, so `AUTHORIZED` is a state the model can
express but the happy path skips. Keeping it costs one enum value and means
manual-capture (useful for fraud review) is a provider-config change later, not
a schema migration.

---

## 6. Contracts

### 6.1 Kafka topics

| Topic | Direction | Key | Consumers |
|---|---|---|---|
| `order.paid` | produced | `userId` | `backend` → grant `Enrollment` |
| `order.failed` | produced | `userId` | none yet (analytics later) |
| `order.refunded` | produced | `userId` | `backend` → revoke `Enrollment` |
| `notifications` | produced | `userId` | `notification-service` (existing contract, unchanged) |

Keying by `userId` — matching `notification-service`'s choice — gives per-user
ordering, so `order.paid` can never be processed after the `order.refunded` that
followed it. There is no global ordering guarantee and none is needed.

Topics are declared as `NewTopic` beans so they exist from first boot rather
than relying on auto-creation, the same way `KafkaTopicConfig` already does in
`notification-service`.

### 6.2 `order.paid` — the contract `backend` codes against

```json
{
  "eventId": "6f1e…",
  "eventType": "order.paid",
  "occurredAt": "2026-09-29T10:14:22Z",
  "tenantId": "learnsphere",
  "orderId": "01J…",
  "userId": "clx123…",
  "courseId": "clx456…",
  "amountMinor": 49900,
  "currency": "INR",
  "provider": "RAZORPAY",
  "providerPaymentId": "pay_PabC…",
  "paidAt": "2026-09-29T10:14:20Z"
}
```

`eventId` is the consumer's dedup handle. `order.refunded` is the same envelope
plus `refundedAmountMinor` and `refundId`; `order.failed` swaps the payment
fields for `errorCode` / `errorMessage`.

**Additive-only.** New optional fields are fine; renaming or removing one is a
breaking change for every consumer.

### 6.3 REST API

All `/api/v1/orders/**` require `Authorization: Bearer <access_token>` and the
`X-Tenant-Id` header (defaulted to `learnsphere` by the filter when absent, so
the frontend need not care yet).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/orders` | user | create an order and a provider checkout session |
| `GET` | `/api/v1/orders/{orderId}` | owner/admin | order + payment status — the polling endpoint |
| `GET` | `/api/v1/orders` | user | purchase history, paged |
| `POST` | `/api/v1/orders/{orderId}/cancel` | owner | abandon a `CREATED`/`PENDING` order |
| `POST` | `/api/v1/orders/{orderId}/retry` | owner | new payment attempt on a `FAILED` order |
| `POST` | `/api/v1/webhooks/{provider}` | **signature** | provider callback — no JWT, no tenant header |
| `POST` | `/api/v1/admin/orders/{orderId}/refund` | admin | full or partial refund |
| `GET` | `/api/v1/admin/orders` | admin | search/filter for support |

`POST /api/v1/orders` — request:

```json
{ "courseId": "clx456…", "provider": "RAZORPAY", "idempotencyKey": "uuid-from-client" }
```

— response `201`:

```json
{
  "orderId": "01J…",
  "status": "PENDING",
  "amountMinor": 49900,
  "currency": "INR",
  "provider": "RAZORPAY",
  "expiresAt": "2026-09-29T10:29:00Z",
  "checkout": {
    "providerOrderId": "order_PabC…",
    "publicKey": "rzp_test_…",
    "params": { "name": "LearnSphere", "description": "Kafka for Beginners" }
  }
}
```

`checkout` is deliberately a loose bag: Razorpay wants `{ key, order_id, amount }`
for its JS modal, Stripe wants a redirect URL or a `clientSecret`. The frontend
switches on `provider` once, in one component. A free order returns
`"status": "PAID"` and `"checkout": null` — the buy button's success path is the
same either way.

`idempotencyKey` is **required** — a client-generated UUID, stable across retries
of the same user intent. Omitting it is a `400`, because `POST` is not idempotent
and this is the field that makes it so (§12.3).

Notable status codes: `400` without an idempotency key, `402` when the course is
unpublished or otherwise not purchasable, `409` when the user already owns the
course, `200` (not `201`) when a request replays an existing order — either by
idempotency key or because an order for that course is already live.

---

## 7. Reliability

### 7.1 Webhook handling

```
POST /api/v1/webhooks/{provider}          ← raw body, never re-serialised
  │
  ├─ registry.get(provider).verify(rawBody, headers)
  │       invalid signature ──▶ 401, nothing written, log with the source IP
  │
  ├─ INSERT INTO webhook_events (provider, provider_event_id) …
  │       unique violation ──▶ 200 "already seen", stop     ← replay protection
  │
  ├─ provider.parse(...) ──▶ List<PaymentEvent>             ← normalised, provider-free
  │
  └─ per event, in ONE transaction:
        SELECT … FROM orders WHERE id = ? FOR UPDATE        ← serialises concurrent webhooks
        guard the transition through OrderStateMachine
        upsert the payments row
        append order_events
        INSERT INTO outbox (order.paid, notifications)      ← same transaction
        mark webhook_events PROCESSED
  │
  └─ 200
```

**As built (D2):** the `webhook_events` insert, the transition, the payment
update and the outbox rows are **one transaction** (`WebhookProcessor`). The
first draft inserted the dedup row before processing; had processing then
crashed, the provider's retry would have hit the unique index, been answered
"already seen", and the payment would have been lost. Now a crash rolls the
dedup row back with everything else and the retry is applied. Two simultaneous
deliveries of one event still collapse to one: the second blocks on
`uq_webhook_event` until the first commits, then reads as a duplicate. An
amount mismatch or an unknown provider order is recorded as `FAILED`/`IGNORED`
and answered `200` — retrying cannot fix either.

Three details that matter and are easy to get wrong:

- **The raw body must survive to the signature check.** Both providers sign the
  exact bytes; letting Jackson parse and re-serialise changes them. The
  controller takes `@RequestBody String`.
- **Return `200` for anything already handled.** A `5xx` makes the provider
  retry, which is correct *only* for genuinely transient failures. An unknown
  event type or an order already `PAID` is a success, not an error.
- **`FOR UPDATE` on the order row.** Razorpay can deliver `payment.captured` and
  `order.paid` within milliseconds of each other; without the lock both read
  `PENDING` and both try to transition.

### 7.2 Outbox relay

A `@Scheduled(fixedDelay = 1000)` poller selects unpublished rows
`ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100`, publishes each via
`KafkaTemplate`, and stamps `published_at`. `SKIP LOCKED` makes it safe to run
several instances.

Delivery is therefore **at-least-once**, and both consumers already absorb that:
`backend`'s `enrollInCourse` is an upsert on the `(userId, courseId)` unique
constraint, and `notification-service` claims a Redis idempotency key per
`(notificationId, channel, attempt)` before sending.

### 7.3 Reconciliation sweeper

Webhooks get lost — a deploy at the wrong moment, a tunnel down in local dev,
a provider incident. A `@Scheduled` job every 5 minutes takes orders stuck in
`PENDING` past a grace period and asks the provider directly via
`provider.fetch(providerPaymentId)`:

- provider says captured → drive the same transition the webhook would have
- provider says failed → `FAILED`
- provider knows nothing and the order is past `expires_at` → `EXPIRED`

This is the difference between a payment integration that works and one that
works *until the day it doesn't*. It is scheduled with Razorpay (Phase 4), not
after, because a mock provider never loses a webhook and so never proves it.

### 7.4 Order expiry

Orders carry `expires_at` (default 15 minutes, `lms.order.ttl`). The same
sweeper expires them. Expiry releases the partial unique index (§11.1) so the
user can start a fresh order for the same course.

### 7.5 The consistency window

Between `PAID` and the enrolment existing there is a gap of, in practice,
Kafka's round trip. The frontend closes it by polling
`GET /api/v1/orders/{orderId}` after checkout and showing "payment received,
unlocking your course" until it flips, then re-fetching the course. If the gap
ever exceeds ~5s the UI says so rather than spinning forever — a paid user
staring at a spinner will email support, and the honest message prevents that.

---

## 8. Security

### 8.1 Authenticating the buyer

`backend` signs its access token HS256 with `ACCESS_TOKEN_SECRET`, and the
payload is `{ id, email, role }` (`backend/services/user.service.ts:75`). That
is precisely what this service needs — including the email, so a receipt can be
addressed **without any user lookup at all**.

| Option | Assessment |
|---|---|
| **A. Validate the same HS256 token with the shared secret** ✅ | A `OncePerRequestFilter` mirroring `NotificationApiFilter`, populating an `OrderContextHolder` `ThreadLocal` cleared in a `finally`. Stateless, no new infra, and a `backend` outage cannot break an in-flight checkout. |
| B. Call `backend` `/users/me` per request | Adds a network hop and a hard liveness dependency to the most latency-sensitive path in the product. |
| C. RS256 + JWKS | The correct long-term answer once a third service needs tokens. Requires changing token issuance and every verifier — not worth bundling into this feature. |

**Decision: A**, with C recorded as the migration trigger. The shared secret
means order-service can *verify* tokens but must never *issue* them; that is
enforced by convention, not by the algorithm, which is the honest weakness of A.

### 8.2 Everything else

- **Webhook endpoints are unauthenticated by JWT and authenticated by
  signature.** They are excluded from the JWT filter explicitly, by path, and
  reject anything failing verification before a single row is written.
- **The amount is never taken from the client.** It comes from the course price
  `backend` reports, and the webhook handler re-checks that the provider's
  captured amount equals the order's `amount_minor`; a mismatch is a hard
  failure and an alert, not a silent accept.
- **Ownership on every read.** `GET /orders/{id}` compares `user_id` to the JWT
  subject; admins bypass. Returning `404` rather than `403` for someone else's
  order avoids confirming it exists.
- **Provider secrets** live in environment variables only, are never logged, and
  the webhook `raw_payload` we persist is scrubbed of card metadata before
  storage.
- **Rate limits** on order creation per user, in Redis, so a scripted buy button
  cannot create ten thousand provider orders.

---

## 9. Cross-service changes

The feature is not deliverable inside one service. These are the contracts the
other three have to meet; each lands in its own repo area with its own tests.

### 9.1 The catalogue owner — `backend/` today, `course-service` tomorrow

These four changes belong to **the course domain**, wherever it lives. Written
here as Express/Prisma because that is where the domain sits today; if
`course-service` exists before Phase 0 starts, they land there instead and
nothing else in this document changes.

**① Internal catalogue endpoint.** `GET /api/v1/internal/courses/:courseId`,
guarded by a new `middleware/internalAuth.ts` — a direct copy of the existing
`transcoderAuth.ts` shape, reading `X-Internal-Api-Key` against an
`INTERNAL_API_KEY` env var. Returns exactly what an order needs to snapshot:

```json
{ "success": true,
  "course": { "id": "clx…", "title": "…", "price": 499.0, "currency": "INR",
              "isPublished": true, "instructorId": "clx…", "amountMinor": 49900 } }
```

Wrapped in `{ success, course }` to match every other route in the service.
`amountMinor` is computed here by `utils/money.ts` so **order-service never sees a
float** — that, not the column type, was the actual requirement (see ③).

It deliberately returns unpublished courses rather than 404-ing them: purchasability
is the caller's policy, and hiding the row would make "why did my order fail" harder
to answer than a `402` with a reason.

**② A Kafka *consumer* — the first anywhere in the Node services.** `services/kafkaConsumer.service.ts`,
group `lms-backend`, subscribing to `order.paid` and `order.refunded`, started
from `index.ts` next to the existing producer. `order.paid` calls the existing
`enrollInCourse` (already an idempotent upsert — it needs only an `orderId` and
`source` added); `order.refunded` revokes.

**③ Prisma schema — in *both* copies** (`backend/prisma/` and
`video-transcoder/prisma/`, per the standing rule). Note that the transcoder's
copy only exists to serve dead code and is scheduled for deletion
(`../DATABASE_DESIGN.md` §3.2), after which this becomes a one-file change:

```prisma
model Enrollment {
  // … existing fields
  orderId   String?          @unique   // provenance; null for grants and legacy rows
  source    EnrollmentSource @default(FREE)
  revokedAt DateTime?                  // refunds revoke rather than delete
}

enum EnrollmentSource { PURCHASE  FREE  ADMIN_GRANT  INSTRUCTOR }

model Course {
  // … existing fields
  currency String @default("INR")
}
```

Two deviations from the first draft of this section, both taken during Phase 0:

**`source` defaults to `FREE`, not `PURCHASE`.** The default only ever applies to
rows nobody set explicitly — which today means every enrolment that already exists,
all of them created by the free enrol endpoint. Defaulting to `PURCHASE` would have
labelled that history as bought.

**`Course.price` stays a `Float`.** It is still the wrong type for money, but
switching it to `Decimal` changes what the API emits from a JSON number to a JSON
string, which breaks `CourseSummary.price: number` in the frontend. That makes it a
frontend-visible change, and it does not belong in an otherwise additive backend
prerequisite. The design's real requirement — *order-service must never re-derive
money from a float* — is met instead by converting once at the boundary
(`utils/money.ts`, `amountMinor`). Note the conversion shifts the decimal exponent
(`Number("1.005e2")`) rather than multiplying, because `1.005 * 100` is
`100.49999999999999` in IEEE754 and silently rounds a half-paisa down. The column
migration is now a frontend-coordinated task, not a Phase 0 one.

**⑤ Entitlement check endpoint.** `GET /api/v1/internal/enrollments/:userId/:courseId`,
same API-key guard. Returns `{ enrolled, enrollment }`, where a row with `revokedAt`
set reads as **not** enrolled so a refunded buyer can purchase again.

order-service needs this to answer duplicate class **c** in §12.3 — "you already own
this course" — which neither unique index can detect, because the previous order is
`PAID` and therefore outside the partial index on active orders. Without it the user
can cheerfully buy the same course twice, which is the duplicate they would actually
complain about.

**④ `POST /courses/:courseId/enroll` changes meaning.** It becomes an
`INSTRUCTOR`/`ADMIN` **grant** endpoint (`source = ADMIN_GRANT`). Students go
through orders — including for free courses (§4). A student hitting it gets
`402` with `{ requiresOrder: true, courseId }` so the frontend can redirect
rather than guess.

### 9.2 `notification-service/` — what "plan accordingly" means

**Phase 3 of this plan requires no Java changes at all.** That is the payoff of
its existing design: order-service publishes a `NotificationMessage` onto the
`notifications` topic and the service renders and sends it. Concretely:

```json
{
  "notificationId": "<orderId>:receipt",
  "tenantId": "learnsphere",
  "userId": "clx123…",
  "channels": ["EMAIL"],
  "templateName": "order-receipt",
  "target": { "email": "student@example.com", "phone": null, "deviceTokens": null },
  "variables": {
    "courseTitle": "Kafka for Beginners",
    "amount": "₹499.00",
    "orderId": "01J…",
    "paymentId": "pay_PabC…",
    "purchasedAt": "29 Sep 2026"
  },
  "attempt": 0
}
```

Deriving `notificationId` from the order id (`<orderId>:receipt`) means a
redelivered `order.paid` produces the *same* notification id, so the existing
Redis idempotency claim suppresses the duplicate email. The receipt is
idempotent end to end without a line of new code.

What the service does need:

1. **Three template rows** (`channel = EMAIL`): `order-receipt`,
   `payment-failed`, `refund-processed`. They go in through the existing
   `POST /api/v1/templates`.
2. **A way for templates to get there reproducibly.** Today nothing seeds Mongo —
   a fresh `docker compose up` has an empty `templates` collection and every
   notification fails `PERMANENT` with "template missing". Proposal: a
   `resources/templates/*.json` set and a dev-profile `ApplicationRunner` that
   upserts them on boot. Small, and it unblocks anyone running the stack fresh.
3. **`{{name}}` in the receipt** needs the buyer's name, which the access token
   does not carry. Either add `name` to the token claims (one line in
   `generateAccessToken`, free for every future service) or add
   `GET /internal/users/:id`. Recommendation: the token claim. §16.3.
4. **Later, not now:** the invoice PDF attachment lands on their existing open
   question about `MimeMessageHelper(multipart = false)`. Phase 7.

### 9.3 `frontend/`

- `lib/api/client.ts` becomes a **factory** — `createClient(baseURL)` — so the
  401-auto-refresh interceptor is shared between the `backend` instance and a
  new order-service instance instead of being copy-pasted. `config/env.ts` gains
  `NEXT_PUBLIC_ORDER_API_URL` (it stays the only place reading `process.env`).
- `lib/api/orders.service.ts` + an `orders` block in `endpoints.ts`.
- `app/courses/[id]` — a Buy button that creates the order, opens the provider's
  checkout, then polls to `PAID` and re-fetches the course.
- `app/orders` — purchase history.
- **Cross-origin auth caveat.** Today the web client authenticates with an
  httpOnly cookie and `withCredentials`. Cookies ignore port, so in local dev the
  cookie reaches `:8086` and this just works. In production, different hosts mean
  it will not — the answer is path routing behind one origin
  (`/api/v1/orders/*` → order-service) in the `deploy/` ingress, which the K8s
  manifests need anyway. Flagged in §16.2 rather than decided here.

---

# Part II — LLD

## 10. Package layout

Deliberately parallel to `notification-service` — same idioms, same place for
the same kind of thing.

The scaffold currently sits at `com.learnsphere.order_service` with a single
`OrderServiceApplication`; Phase 1 moves it to the root below.

```
com.lms.order_service
├── config/       KafkaTopicConfig, SecurityConfig, RestClientConfig,
│                 RedisConfig, SchedulingConfig
├── constants/    ApplicationConstants
├── models/
│   ├── domain/   OrderStatus, PaymentStatus, PaymentProviderType, RefundStatus,
│   │             PaymentEventType, ErrorType
│   ├── context/  OrderContext, OrderContextHolder          ← ThreadLocal, per request
│   ├── entity/   AbstractEntity, Order, Payment, Refund,
│   │             WebhookEvent, OutboxMessage, OrderEvent
│   ├── event/    OrderPaidEvent, OrderFailedEvent, OrderRefundedEvent,
│   │             NotificationMessage, NotificationTarget    ← mirrors notification-service
│   ├── request/  CreateOrderRequest, RefundRequest
│   └── response/ OrderResponse, CheckoutResponse, PaymentResponse
├── repository/   OrderRepository, PaymentRepository, RefundRepository,
│                 WebhookEventRepository, OutboxRepository, OrderEventRepository
├── provider/     PaymentProvider, PaymentProviderRegistry
│                 ├── mock/     MockPaymentProvider
│                 ├── razorpay/ RazorpayPaymentProvider, RazorpaySignatureVerifier
│                 └── stripe/   StripePaymentProvider, StripeSignatureVerifier
├── service/      OrderService, PaymentService, RefundService,
│                 OrderStateMachine, CatalogueClient, OutboxService,
│                 IdempotencyService, ReconciliationService, NotificationPublisher
├── kafka/        OutboxRelay, OrderEventProducer
├── controller/   OrderController, WebhookController, AdminOrderController
├── filters/      JwtAuthenticationFilter, OrderApiFilter
├── exception/    AbstractException + subclasses, GlobalExceptionHandler
└── utils/        MoneyUtils, CommonUtils
```

### The extensibility hinge

```java
public interface PaymentProvider {

    PaymentProviderType type();

    /** Creates the provider-side order/session. Returns what the browser needs to start checkout. */
    CheckoutSession createCheckout(Order order);

    /** Verifies the raw webhook bytes. Never parses before verifying. */
    WebhookVerification verify(String rawBody, Map<String, String> headers);

    /** Normalises a verified webhook into provider-free events. One webhook may carry several. */
    List<PaymentEvent> parse(WebhookVerification verified);

    /** Reads the provider's own view of a payment — the reconciliation path (§7.3). */
    PaymentSnapshot fetch(String providerPaymentId);

    RefundResult refund(Payment payment, long amountMinor, String reason);
}
```

```java
@Component
@RequiredArgsConstructor
public class PaymentProviderRegistry {
    private final List<PaymentProvider> providers;
    private Map<PaymentProviderType, PaymentProvider> byType;

    @PostConstruct
    void index() {
        byType = providers.stream().collect(toMap(PaymentProvider::type, identity(),
                (a, b) -> { throw new IllegalStateException("two providers for " + a.type()); },
                () -> new EnumMap<>(PaymentProviderType.class)));
    }

    public Optional<PaymentProvider> get(PaymentProviderType type) { … }
    public Set<PaymentProviderType> enabled() { … }
}
```

**Adding a provider is exactly three things**, none of which touch the state
machine, the controllers, the schema, or any consumer:

1. `provider/<name>/<Name>PaymentProvider implements PaymentProvider`, annotated
   `@Component` and `@ConditionalOnProperty` on its own enable flag.
2. Credentials in `application.properties`.
3. An enum constant in `PaymentProviderType`.

`PaymentProviderType` carries constants for providers not yet implemented, so a
client can *ask* for one and get a clean `400 provider not enabled` rather than
a crash — the same behaviour `ChannelType.SMS` already has next door.

The normalised event the rest of the service actually sees:

```java
public record PaymentEvent(
    String           providerEventId,
    PaymentEventType type,              // PAYMENT_CAPTURED | PAYMENT_FAILED | REFUND_PROCESSED
    String           providerOrderId,
    String           providerPaymentId,
    long             amountMinor,
    String           currency,
    String           method,            // card | upi | netbanking — provider-reported, informational
    String           errorCode,
    String           errorMessage,
    Instant          occurredAt
) {}
```

Nothing downstream of `parse()` knows which provider it came from.

---

## 11. Data model — Postgres schema `orders`, Flyway-managed

Flyway rather than `ddl-auto`: the money tables are the last place to want a
schema inferred at boot. `spring.jpa.hibernate.ddl-auto=validate`.

### 11.1 `orders`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `tenant_id` | `varchar(64)` | indexed |
| `user_id` | `varchar(64)` | `backend` cuid; indexed |
| `user_email` | `varchar(320)` | snapshot from the JWT — receipts need no user lookup |
| `course_id` | `varchar(64)` | indexed |
| `course_title` | `varchar(255)` | snapshot |
| `instructor_id` | `varchar(64)` | snapshot — future payouts |
| `amount_minor` | `bigint` | paise/cents |
| `currency` | `char(3)` | ISO 4217 |
| `status` | `varchar(32)` | §5.1 |
| `provider` | `varchar(32)` | `RAZORPAY \| STRIPE \| MOCK \| NONE` |
| `idempotency_key` | `varchar(128)` | |
| `expires_at` | `timestamptz` | |
| `paid_at`, `cancelled_at` | `timestamptz` | nullable |
| `created_at`, `updated_at` | `timestamptz` | from `AbstractEntity` |
| `version` | `bigint` | JPA `@Version`, optimistic lock |

```sql
CREATE UNIQUE INDEX uq_order_idem ON orders (tenant_id, user_id, idempotency_key);

-- at most one live order per user per course; expiry/cancel frees it
CREATE UNIQUE INDEX uq_order_active ON orders (tenant_id, user_id, course_id)
  WHERE status IN ('CREATED', 'PENDING');
```

The partial unique index is what makes double-clicking Buy safe even when the
client forgets its idempotency key.

### 11.2 `payments`

`id`, `order_id` FK, `provider`, `provider_order_id`, `provider_payment_id`,
`status`, `amount_minor`, `currency`, `method`, `error_code`, `error_message`,
`raw_payload jsonb`, `created_at`, `updated_at`.

`UNIQUE (provider, provider_payment_id)`. One order may have many payments —
declined card, then UPI.

### 11.3 `refunds`

`id`, `payment_id` FK, `provider_refund_id` (unique), `amount_minor`, `status`,
`reason`, `requested_by`, `created_at`, `updated_at`.

### 11.4 `webhook_events` — dedup and audit

`id`, `provider`, `provider_event_id`, `event_type`, `signature_valid`,
`payload jsonb`, `status` (`RECEIVED | PROCESSED | IGNORED | FAILED`),
`received_at`, `processed_at`, `error`.

`UNIQUE (provider, provider_event_id)` — the replay guard of §7.1. Keeping the
raw payload means a support question about a payment from three months ago has
an answer that does not involve logging into a gateway dashboard.

### 11.5 `outbox`

`id`, `aggregate_type`, `aggregate_id`, `topic`, `message_key`, `payload jsonb`,
`created_at`, `published_at`, `attempts`, `last_error`.

`CREATE INDEX idx_outbox_unpublished ON outbox (id) WHERE published_at IS NULL;`

Rows are kept after publishing (a 30-day retention job later) so "was the event
actually emitted" is answerable.

### 11.6 `order_events`

`id`, `order_id` FK, `from_status`, `to_status`, `reason`, `actor`,
`created_at`. Append-only. Never updated, never deleted.

---

## 12. Key flows in code

### 12.1 Create order

`POST` is not idempotent, so the endpoint has to be made so explicitly. The
ordering below is the whole point: **the database arbitrates before the gateway
is touched.**

```java
// NOT @Transactional. A constraint violation marks its transaction rollback-only,
// so the recovery read has to happen outside the transaction that failed.
public CreateOrderResult create(CreateOrderRequest req, OrderContext ctx) {
    try {
        return tx.attemptCreate(req, ctx);
    } catch (DataIntegrityViolationException e) {
        // Lost a race. Someone else's order for this (user, course) is the truth.
        return CreateOrderResult.replay(tx.resolveExisting(req, ctx));
    }
}
```

```java
@Transactional
public CreateOrderResult attemptCreate(CreateOrderRequest req, OrderContext ctx) {

    // ① Cheap path: this exact request already succeeded. Covers the ordinary
    //    retry, where there is no concurrency at all.
    var replay = orderRepository.findByIdempotencyKey(
            ctx.tenantId(), ctx.userId(), req.idempotencyKey());
    if (replay.isPresent()) return CreateOrderResult.replay(replay.get());

    CourseSnapshot course = catalogueClient.require(req.courseId());     // ② in §3
    if (!course.isPublished()) throw new NotPurchasableException(course.id());

    // ② The duplicate no index can catch: they already own it. §9.1 ⑤.
    if (catalogueClient.isEnrolled(ctx.userId(), course.id())) {
        throw new AlreadyEnrolledException(course.id());
    }

    // ③ Claim the slot FIRST, as CREATED, and flush. This is where uq_order_idem
    //    and uq_order_active arbitrate between racing requests — before any money
    //    machinery exists, so the loser throws having created nothing anywhere.
    Order order = Order.from(ctx, course, req.provider(), ttl);
    orderRepository.saveAndFlush(order);

    if (order.isFree()) {                                   // ₹0 — no gateway
        stateMachine.transition(order, PAID, Actor.SYSTEM, "free course");
        outbox.enqueue(OrderPaidEvent.of(order));
        outbox.enqueue(NotificationPublisher.receipt(order, null));
        return CreateOrderResult.free(orderRepository.save(order));
    }

    // ④ Only the winner of ③ ever reaches the provider.
    PaymentProvider provider = registry.get(req.provider())
        .orElseThrow(() -> new ProviderNotEnabledException(req.provider()));
    CheckoutSession session = provider.createCheckout(order);
    paymentRepository.save(Payment.initiated(order, session));
    stateMachine.transition(order, PENDING, Actor.USER, "checkout created");
    return CreateOrderResult.checkout(orderRepository.save(order), session);
}
```

**Why the insert moved ahead of the provider call.** The first draft of this
section called the gateway first and flagged the transaction-across-a-network-call
cost as the only trade-off. That was the wrong trade to weigh. With a read-then-insert
and the gateway call in between, two concurrent buys both miss ①, both create a
Razorpay order, and only then does one lose at commit — leaving a real provider-side
order that nobody will ever pay and that shows up in reconciliation as noise.
Flushing the local row first costs nothing and makes the loser fail before it can
spend anything.

**Why `create` is not itself transactional.** Once JPA sees a constraint violation
the transaction is rollback-only; issuing the recovery read inside it throws again
and hides the real outcome. The public method stays outside, catches, and re-reads
in a fresh transaction. This is the single most common way an insert-or-get gets
written wrongly in Spring.

### 12.2 `CatalogueClient`

A `RestClient` against `backend`, sending `X-Internal-Api-Key`, with a 3s
timeout and no retry on `404`. A `5xx` or timeout is a `503` to the buyer —
"we could not start your purchase, try again" — never a guess at the price.

### 12.3 Preventing duplicate orders

`POST /api/v1/orders` is not idempotent by nature, and three genuinely different
duplicates can come out of it. Each needs its own guard; none of the three
substitutes for the others.

| # | The duplicate | Guard | Result |
|---|---|---|---|
| **a** | The *same request* arrives twice — double-clicked Buy, a client retry after a timeout, a flaky network | `uq_order_idem` on `(tenant_id, user_id, idempotency_key)` | `200` with the original order |
| **b** | *Different requests*, same course, while the first is still unpaid — two tabs, back-button-then-retry | `uq_order_active`, partial unique on `(tenant_id, user_id, course_id) WHERE status IN ('CREATED','PENDING')` | `200` with the live order |
| **c** | They **already own the course** from an earlier, completed purchase | an entitlement check against the catalogue owner (§9.1 ⑤) — *no index can see this*, the old order is `PAID` and so outside b's partial index | `409 AlreadyEnrolled` |

`idempotencyKey` is **required**; a request without one is `400`. Making it
optional would mean guard **a** silently does not apply to the client that most
likely needs it.

Guard **b** is what makes the feature safe even when a client forgets or reuses
its key badly, and it is why `EXPIRED` and `CANCELLED` are excluded from the
partial index — abandoning a checkout has to free the user to start a new one.

All three are enforced by the sequence in §12.1: check, then **flush the local row
before calling the gateway**, so a loser never creates a provider-side order.

### 12.4 Idempotency everywhere else

| Layer | Key | Guards against |
|---|---|---|
| Order creation | §12.3 above | duplicate orders |
| Payment retry | order row `SELECT … FOR UPDATE` + `FAILED`-only guard | two concurrent retries opening two sessions |
| Webhook ingest | `(provider, provider_event_id)` unique index | provider redelivery, replay attack |
| Notification | `<orderId>:receipt` as `notificationId` | duplicate receipt email (§9.2) |
| Enrolment | `(userId, courseId)` upsert at the catalogue owner | at-least-once `order.paid` |

Redis is used only for rate limiting and sweeper leader-election, **not** for
correctness. Every correctness guarantee above is a Postgres unique constraint,
so a Redis outage cannot produce a double charge or a double enrolment.

---

## 12.5 Scalability

This service is on the money path, so "scales" has to mean *scales without ever
double-charging*. The design gets that from constraints rather than from
coordination, and the table below is what that buys.

| Property | Why N replicas are safe today |
|---|---|
| **Stateless request handling** | JWT verified per request against a shared secret; the only per-request state is a `ThreadLocal` cleared in a `finally` |
| **Outbox relay** | `SELECT … ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100`. Two relays never claim the same row, and neither blocks the other |
| **Concurrent webhooks for one order** | `SELECT … FROM orders WHERE id = ? FOR UPDATE` serialises them. Razorpay can deliver `payment.captured` and `order.paid` milliseconds apart; without the lock both read `PENDING` and both transition |
| **Duplicate order creation** | Two unique indexes arbitrate (§12.3), and the local row is **flushed before the gateway is called** — so the loser of a race fails having spent nothing |
| **Webhook replay** | `UNIQUE (provider, provider_event_id)` |
| **Reconciliation sweeper** | Must run as one. Redis leader election, and a sweep that is idempotent anyway because it drives the same guarded transition a webhook would |

**Where it gives way first, and what to do:**

1. **Provider latency on the create path.** `POST /orders` makes two internal
   calls and one gateway call over the internet. It is the slowest endpoint in
   the product by construction. Keep the `RestClient` timeout at 3s and fail
   with `503` rather than queueing — a buyer waiting 30s has already left.
2. **Outbox relay throughput.** A `fixedDelay` of 1s × 100 rows is 100 events/s
   per replica, which is far above the 50/s burst target
   (`../ARCHITECTURE.md` §6.4). Raise the batch before adding replicas; the
   relay is cheap and the index is partial.
3. **Postgres write contention on `orders`.** The hottest writes in the system.
   The schema is already separate, so promoting `orders` to its own instance is
   a connection-string change (`../DATABASE_DESIGN.md` §3.1).
4. **`webhook_events.payload` growth.** Raw bodies for every event forever. The
   retention rule — 12 months, then drop the payload and keep the row — is in
   `../DATABASE_DESIGN.md` §9 and should be a scheduled job, not a manual
   cleanup.
5. **Admin search.** `GET /admin/orders` with filters will want indexes on
   `(tenant_id, status, created_at DESC)` and `(tenant_id, user_id)`. Add them
   with Phase 6, when the queries exist.

**The property worth protecting above all others:** every correctness guarantee
here is a Postgres unique constraint or a row lock, never a Redis key. Redis is
used for rate limiting and leader election only, so a Redis outage degrades
throughput and cannot produce a double charge or a double enrolment.

## 12.6 Observability

A payment that crosses four processes has to be followable, and today nothing in
the platform can do that (`../ARCHITECTURE.md` §7.4). This service is the one
that most needs it, so it should arrive here first.

| Signal | What |
|---|---|
| Logs | `orderId`, `userId`, `tenantId` and `provider` on every line, so one purchase greps out end to end |
| Counters | `orders_created_total{provider}`, `orders_paid_total{provider}`, `orders_failed_total{errorCode}`, `webhooks_received_total{provider,valid}`, `outbox_published_total`, `refunds_total` |
| Gauges | unpublished outbox depth, orders stuck in `PENDING` past the grace period |
| Histogram | create-order latency split by internal calls vs the gateway call — otherwise a slow gateway looks like a slow service |
| **Alerts** | outbox depth rising for >5 min; any amount mismatch (§8.2); any invalid webhook signature; `PENDING` backlog growing. The first three mean something is wrong with money and should page |
| Trace | one trace id propagated from the frontend through the internal call and onto the Kafka header, so the consumer's enrolment write joins the same trace |

`micrometer-registry-prometheus` plus the Actuator already on the Spring
classpath. Deliberately **not** deferred to a later phase than Razorpay: the
first real payment should not be the first time we find out whether we can see
one.

---

## 13. Error classification

| Class | HTTP | Examples | Retryable |
|---|---|---|---|
| `VALIDATION` | 400 | unknown provider, malformed body | no |
| `AUTH` | 401/403 | bad/expired JWT, someone else's order | no |
| `NOT_FOUND` | 404 | unknown order or course | no |
| `CONFLICT` | 409 | already enrolled, order not in a state that allows this | no |
| `NOT_PURCHASABLE` | 402 | unpublished course, provider disabled | no |
| `PROVIDER_TRANSIENT` | 503 | gateway timeout or 5xx | yes, client may retry |
| `PROVIDER_PERMANENT` | 502 | gateway rejected the request outright | no, alert |
| `INTERNAL` | 500 | everything unexpected | — |

Handled by a `GlobalExceptionHandler` on `AbstractException`, the same pattern
already in `notification-service`. Webhook responses do **not** follow this
table — see §7.1, they answer `200` unless the signature failed or the failure
is genuinely worth a provider retry.

---

## 14. Configuration

Env-overridable, defaults matching `docker-compose.yml`.

| Key | Default |
|---|---|
| `server.port` | `8086` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5434/testDB?currentSchema=orders` |
| `SPRING_DATASOURCE_USERNAME` / `PASSWORD` | `testUser` / `mysecretpassword` |
| `spring.flyway.schemas` | `orders` |
| `KAFKA_BROKERS` / `KAFKA_GROUP_ID` | `localhost:9092` / `order-service` |
| `REDIS_HOST` / `PORT` / `PASSWORD` | `localhost` / `6379` / `local` |
| `ACCESS_TOKEN_SECRET` | *(required — same value as `backend`)* |
| `BACKEND_BASE_URL` | `http://localhost:5000` |
| `INTERNAL_API_KEY` | *(required — same value as `backend`)* |
| `lms.order.ttl` | `PT15M` |
| `lms.order.default-currency` | `INR` |
| `lms.order.topics.paid/failed/refunded` | `order.paid` / `order.failed` / `order.refunded` |
| `lms.order.topics.notifications` | `notifications` |
| `lms.payment.mock.enabled` | `true` in dev, `false` in prod |
| `lms.payment.razorpay.enabled` / `key-id` / `key-secret` / `webhook-secret` | `false` / — |
| `lms.payment.stripe.enabled` / `secret-key` / `webhook-secret` | `false` / — |

The app fails fast on a missing `ACCESS_TOKEN_SECRET` or `INTERNAL_API_KEY`, the
way `backend/app.ts` already does — a service that boots without them looks
healthy and rejects every request.

A `make order` target joins the existing Makefile.

### 14.1 Dependencies Phase 1 adds

The scaffold has only `spring-boot-starter-webmvc` and
`spring-boot-starter-kafka`. Phase 1 adds, alongside the Java 21 / Boot 4.0.3
alignment: `spring-boot-starter-data-jpa`, `postgresql`, `flyway-core`,
`flyway-database-postgresql`, `spring-boot-starter-data-redis`,
`spring-boot-starter-validation`, `spring-boot-starter-actuator`, `lombok`,
`jjwt` (or `spring-security-oauth2-jose`) for HS256 verification, and
`testcontainers` (postgres + kafka) with `spring-boot-testcontainers` for the
test scope. Provider SDKs arrive with their phases, not before — the mock
provider needs none of them, which is the point of shipping it first.

**As built**, three departures from that list:

- **No `jjwt` (D3).** `filters/AccessTokenVerifier` verifies HS256 with
  `javax.crypto`: `alg` is pinned to `HS256` (so `none` and alg-confusion tokens
  fail), the MAC is compared with `MessageDigest.isEqual`, `exp` is required.
  It only ever verifies, which is the one operation this service may perform, and
  it is covered by `AccessTokenVerifierTest` including forged, expired and
  `alg:none` tokens. Swap for `jjwt` or Spring's `NimbusJwtDecoder` when RS256 +
  JWKS lands (§8.1 option C) — that change is one class.
- **No Redis yet (D4).** Its only jobs here are the per-user order-creation rate
  limit and sweeper leader election; neither is in Phase 1, and an unused Redis
  starter would only add a health indicator that goes red when Redis is down.
  It arrives with the rate limit (Phase 4, before real money).
- **`spring-boot-starter-flyway`**, not bare `flyway-core`: in Boot 4 Flyway
  auto-configuration lives in its own module and the bare jar does nothing. The
  `RestClient` is built directly from `spring-web`, so no restclient starter.

Testcontainers 2.x module names: `testcontainers-postgresql`,
`testcontainers-kafka`, `testcontainers-junit-jupiter` (all managed by the Boot
4.0.3 BOM at 2.0.3).

---

## 15. Testing

There are no tests in any Node service today and only the Spring scaffold next
door. This service is the wrong place to continue that, because it is the one
that can lose money.

| Level | What |
|---|---|
| Unit | `OrderStateMachine` — every legal and illegal transition, asserted exhaustively. `MoneyUtils` rounding. Each provider's signature verifier against captured real payloads. |
| Slice | `@WebMvcTest` on `WebhookController`: bad signature → 401 and **zero writes**; replayed event → 200 and one row; amount mismatch → rejected. |
| Repository | `@DataJpaTest` for the partial unique indexes — the double-buy and idempotency-replay cases. |
| Integration | Testcontainers (Postgres + Kafka): create → mock webhook → assert `PAID`, one `outbox` row, one `order.paid` on the topic. |
| Cross-service | Catalogue owner: `/internal/courses/:id` auth, and the `order.paid` consumer granting an enrolment idempotently. In `backend/` today that is Jest with the existing shared Prisma mock. |

`MockPaymentProvider` is what makes all of this cheap — the full chain is
testable with no gateway account and no network.

---

# Part III — Phases

Each phase leaves every service running and is independently reviewable.

### Phase 0 — catalogue-owner prerequisites ✅
`middleware/internalAuth.ts`, `routes/internal.routes.ts`,
`controllers/internal.controller.ts`, `services/course.service.ts →
getCourseForCatalogue` + `getEnrollment` (the §12.3 **c** entitlement check),
`utils/money.ts`; `Enrollment.orderId`/`source`/`revokedAt`
and `Course.currency` in **both** Prisma schemas; `INTERNAL_API_KEY` exempted from
the rate limiter and added to `.env.sample`. `Course.price` stays `Float` — §9.1 ③.
Tests: `tests/unit/money.test.ts`, `tests/unit/middleware.internalAuth.test.ts`,
`tests/integration/internal.routes.test.ts`.

> **Verified partially.** The two new unit suites pass (10 tests). The new
> integration suite cannot *compile* in this environment because
> `npx prisma generate` fails without network access to `binaries.prisma.sh`, so
> `@prisma/client` ships stub types — the same pre-existing failure that already
> takes out `auth.routes`, `course.routes`, `admin.routes` and
> `videoUpload.routes` on a clean checkout. Run `npx prisma generate && npm test`
> on a networked machine to close this out. `tsc --noEmit` reports zero errors in
> any file this phase added.

*Would have landed in `course-service` instead if that service had existed first —
see §2.1.*

### Phase 1 — order-service skeleton on the mock provider
**First, align the scaffold** (header, §10, §14.1): Java 17 → 21, Boot 4.1.1 →
4.0.3, `com.learnsphere.order_service` → `com.lms.order_service`, and the
dependency set. It is four files and a package move while the service is still
empty — the cheapest moment it will ever be.
Then: Flyway schema, JWT filter + context holder, `PaymentProvider` + registry
+ `MockPaymentProvider`, `OrderStateMachine`, `CatalogueClient`,
`POST /orders`, `GET /orders/{id}`, outbox + relay, `order.paid` published.
**Verify:** create an order against a real course, POST the dev mock webhook,
see `order.paid` land in Kafka UI on `:8080`. No money, no gateway, no frontend.

> **Status (covers Phases 1–6 of this service): written, unit-tested, not yet built with Maven.**
>
> | Check | Result |
> |---|---|
> | `javac --release 21 -Xlint:all` over all of `src/main` | **clean, zero warnings** (96 classes) — against the cached Boot 4.0.3 jars, with signature-only stubs for the uncached `jakarta.persistence`, Spring Data JPA and Hibernate annotations |
> | Unit tests: state machine (every combination), token verifier, mock / Razorpay / Stripe signatures and parsing, registry, receipts, money formatting, sweeper, refunds | **48/48 pass** |
> | `OrderFlowIntegrationTest` (Testcontainers Postgres + Kafka) | **not run** — needs Docker and the Testcontainers jars |
> | `./mvnw install` | **fails at dependency resolution**: no network to Maven Central, and 9 artifacts (JPA, Flyway, Postgres driver, Testcontainers) were never downloaded. Maven resolved every coordinate and version, so the POM is valid |
>
> **To close the phase,** on a machine with network and Docker:
>
> ```bash
> docker compose up -d                        # repo root
> cd order-service && cp .env.sample .env
> ./mvnw install                              # compiles against real JPA, runs all tests incl. Testcontainers
> make order                                  # from the repo root
> ```
>
> Then the manual check, against the backend's catalogue (`TOKEN` = an
> `access_token` cookie value from a logged-in browser session):
>
> ```bash
> curl -s localhost:8086/api/v1/orders -H "Authorization: Bearer $TOKEN" \
>   -H 'Content-Type: application/json' \
>   -d '{"courseId":"<published course id>","provider":"MOCK","idempotencyKey":"'"$(uuidgen)"'"}'
> # → 201, status PENDING, checkout.providerOrderId = mock_order_…
> curl -s -X POST localhost:8086/api/v1/mock-gateway/orders/<providerOrderId>/capture
> # → webhookStatus PROCESSED; order.paid appears in Kafka UI (:8080) keyed by userId
> ```
>
> Things the javac check could not prove and Maven will: that Hibernate
> validates the entities against `V1__orders_baseline.sql`
> (`ddl-auto=validate`), the `PurchaseOrder` JPQL in `findByIdForUpdate`, and the
> `SKIP LOCKED` native query.

**What shipped** (`src/main/java/com/lms/order_service/`):

| Area | Files |
|---|---|
| Schema | `db/migration/V1__orders_baseline.sql` — `orders`, `payments`, `webhook_events`, `outbox`, `order_events`, both unique indexes of §12.3 |
| Auth | `filters/AccessTokenVerifier`, `filters/JwtAuthenticationFilter` (Bearer or `access_token` cookie; tenant defaults to `learnsphere`), `models/context/*` |
| State | `service/OrderTransitions` (pure table), `service/OrderStateMachine` (applies + writes `order_events`) |
| Create | `service/OrderService` (non-transactional, recovers a lost race), `service/OrderCreationTx` (§12.1 sequence, plus lazy expiry of a stale live order), `service/CatalogueClient` |
| Providers | `provider/PaymentProvider` + `PaymentProviderRegistry`; `provider/mock/` — `MockPaymentProvider` (refuses to start under the `prod` profile), `MockWebhookSignature`, `MockGatewayController` |
| Webhooks | `controller/WebhookController` (raw `String` body), `service/WebhookService` → `WebhookProcessor` → `PaymentEventHandler` (amount/currency guard, duplicate-capture alert) |
| Events | `service/OutboxService` (`Propagation.MANDATORY`), `kafka/OutboxRelay` (`SKIP LOCKED`, stops at the first failure to keep per-user order), `models/event/OrderPaidEvent`, `OrderFailedEvent` |

**The mock gateway.** `POST /api/v1/mock-gateway/orders/{providerOrderId}/{capture|fail}`
plays the provider: it builds a Razorpay-shaped webhook
(`{ event, payload.payment.entity }`), signs it with
`MOCK_WEBHOOK_SECRET`, and sends it through the real verify → parse → apply path,
so the signature check is exercised rather than bypassed. An optional
`{"amountMinor": 100}` body exercises the mismatch guard. It exists only while
`lms.payment.mock.enabled=true`. A raw webhook can also be sent by hand to
`/api/v1/webhooks/mock` with `X-Mock-Event-Id` and
`X-Mock-Signature: hex(HMAC-SHA256(secret, body))` — the same scheme as
`X-Razorpay-Signature`, so Phase 4's verifier is the same code with a different
secret.

**Small calls made in passing**, all reversible: replaying an `idempotencyKey`
for a *different* course is `409`; an instructor buying their own course is
`409`; asking for a provider that is not enabled is `400` (the §13 table said
`402` for "provider disabled" while §10 said `400` — `400` won, as the client
asked for something not on offer); `payments` gained a `checkout jsonb` column
so a replayed `PENDING` order returns its checkout and can be resumed.

### Phase 2 — enrolment actually granted
The catalogue owner's first Kafka consumer; `enrollInCourse` gains `orderId`/`source`;
`POST /courses/:id/enroll` becomes a grant endpoint.
**Verify:** the Phase 1 flow now flips `GET /courses/:id` to `enrolled: true`,
and replaying the same event twice still yields one enrolment row.

> **Status: done in `backend/`, Jest 125/125, `tsc` clean.** Not run against Kafka.
> `services/kafkaConsumer.service.ts` (group `lms-backend`, `order.paid` +
> `order.refunded`) starts from `index.ts`. A malformed record is skipped; a database
> error is rethrown so kafkajs retries instead of committing. Two pre-existing bugs
> fixed on the way, both of which would have broken refunds: **`isEnrolled` ignored
> `revokedAt`** (a refunded buyer kept watching), and **`enrollInCourse`'s upsert had
> `update: {}`** (re-buying after a refund never re-granted). `grantFromOrder` refuses
> to resurrect access revoked for the *same* order; `revokeFromOrder` touches only what
> that order granted. `POST /courses/:id/enroll` now answers students
> `402 { requiresOrder, courseId }` and lets the course's instructor or an admin grant
> (`source` `INSTRUCTOR` / `ADMIN_GRANT`). Added `GET /courses/enrolled` for the
> frontend's "My learning".

### Phase 3 — receipts
`NotificationPublisher` writes `NotificationMessage`s to the outbox for paid and
failed orders; the three templates and the seeding runner in
`notification-service`.
**Verify:** an email arrives. Depends on notification-service Phase 1 compiling
(its `SYSTEM_DESIGN.md` §12 — one `./mvnw compile` still outstanding).

> **Status: done.** `NotificationPublisher` enqueues `order-receipt` (paid and free
> orders), `payment-failed` (one per failed attempt: `<orderId>:payment-failed:<paymentId>`)
> and `refund-processed`, in the same transaction as the state change. §16.3 resolved:
> the access token now carries `name`, snapshotted onto `orders.user_name`.
> notification-service: the three templates ship in `resources/seed-templates/` and
> `TemplateSeeder` inserts any that are missing on boot (never overwriting API edits).
> Its Phase 1 now **compiles with Maven** — after fixing a `catch` of an interface
> (`AbstractException` is not a `Throwable`) and moving it to Jackson 3, without which
> its Kafka beans would not have been created under Boot 4.

### Phase 4 — Razorpay, and the frontend buy flow
They land together because neither is testable alone: `RazorpayPaymentProvider`
+ signature verification + real webhook, plus `orders.service.ts`, the client
factory, the Buy button and status polling. Order expiry and the reconciliation
sweeper (§7.3–7.4) belong here — this is the first phase where a webhook can
actually go missing.
**Verify:** a test-mode card buys a course end to end in the browser; kill the
webhook deliberately and watch the sweeper recover the order.

> **Status: written, unit-tested, not run against Razorpay.** `provider/razorpay/`:
> orders API (`POST /v1/orders`), checkout.js params, `X-Razorpay-Signature` over the
> raw body, `payment.captured` / `order.paid` / `payment.failed` / `refund.processed` /
> `refund.failed`, reconciliation via `GET /v1/orders/{id}/payments`. Enable with
> `RAZORPAY_ENABLED=true` plus `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
> `RAZORPAY_WEBHOOK_SECRET`; point the dashboard webhook at
> `/api/v1/webhooks/razorpay`. Sweeper (`ReconciliationSweeper` → `ReconciliationService`,
> every 5 min, D5) recovers lost captures and expires abandoned orders. Also shipped:
> `POST /orders/{id}/cancel`, `POST /orders/{id}/retry` (new payment attempt, fresh
> expiry), `GET /orders/providers`, a per-user Redis rate limit (10/min, fails open),
> and a `CorsFilter` ahead of the JWT filter. Frontend: see `../frontend/SYSTEM_DESIGN.md`.

### Phase 5 — Stripe
The proof that the abstraction holds. If this phase touches anything outside
`provider/stripe/`, config, and one enum constant, the seam was wrong.

> **Status: written, unit-tested — and the seam held.** Stripe touched
> `provider/stripe/` and `application.properties` only; the `STRIPE` constant already
> existed. Hosted Checkout Sessions (redirect), `Stripe-Signature` with a 5-minute
> replay tolerance and secret rotation (any `v1` may match), `checkout.session.*` and
> `refund.updated`. The session must live ≥30 min by Stripe's rule, longer than our
> 15-minute order TTL — a payment made in that gap lands as a late capture (D1).

### Phase 6 — refunds and admin
`RefundService`, the admin endpoints, `order.refunded` → enrolment revocation,
purchase history UI.

> **Status: written, unit-tested.** `V2__refunds.sql` (`refunds`, `uq_refund_one_pending`,
> the admin-search index). `RefundService`: full or partial, one in flight (D8), a
> provider rejection rolls back the refund row and the transition together, a
> synchronous success completes immediately (D7), otherwise the refund webhook does.
> `order.refunded` gains `refundId`, `refundedAmountMinor`, `totalRefundedMinor` and
> **`fullRefund`** — §16.6 resolved: only a full refund revokes access. Endpoints:
> `GET /api/v1/orders` (history), `GET /api/v1/admin/orders`,
> `POST /api/v1/admin/orders/{id}/refund`. Responses carry `refundedMinor`.

### Phase 7 — deferred, recorded so they are not silently re-litigated
Invoices (PDF → S3 → email attachment, which needs `notification-service`'s
`multipart` flipped), coupons, carts and multi-item orders, instructor payouts,
tax/GST, Prometheus metrics and a revenue dashboard.

---

## 16. Open questions for you

**Answer 8 and 9 first — they set the phase order. The rest are local choices.**

1. **Free courses through the order flow.** §4 routes ₹0 courses through an
   order with `provider = NONE` so there is one enrolment path and one audit
   trail. The cheaper alternative is keeping today's direct
   `POST /courses/:id/enroll` for free courses only. My preference is the single
   path; it is the kind of thing that is annoying to unify later.
2. **Cross-origin auth in production.** Dev works on the cookie by accident
   (cookies ignore port). Production needs either path routing behind one origin
   in the `deploy/` ingress, or the frontend switching to `Authorization: Bearer`
   for order-service. The ingress is the better answer and the manifests need
   work anyway — confirm that is the direction.
3. ~~**`name` in the access token.**~~ **Resolved: added** (Phase 3). Adding it to `generateAccessToken` is one line
   and gives every future service a personalised greeting for free; the
   alternative is a `GET /internal/users/:id` call this design otherwise does not
   need. Cheap, but it is your token contract.
4. ~~**`Course.price` `Float` → `Decimal`.**~~ **Resolved during Phase 0:** split
   out. The column stays `Float`; money is converted at the boundary. Doing the
   migration means changing a JSON type the frontend consumes, so it belongs with
   frontend work. Reasoning in §9.1 ③.
5. ~~**Which provider first in Phase 4.**~~ **Resolved: Razorpay**, confirmed by
   you. Stripe stays Phase 5 as the test of the abstraction. The mock already
   speaks Razorpay's webhook envelope and signature scheme to keep Phase 4 small.
6. **Refund policy.** *Built:* a full refund revokes immediately; a partial refund
   keeps access. Still open — right now refunds revoke the enrolment immediately
   (`revokedAt`). A window-based policy ("7 days, only if under 20% watched")
   needs watch-progress data that does not exist yet — worth designing towards,
   or deliberately out of scope?
7. **Tenant id.** Carried on every row and every event for consistency with
   `notification-service`. Confirm that is wanted here too, or say so now and it
   comes out while it is free.
8. **When does `course-service` get extracted — before or after commerce?**
   *(Also tracked as `../ARCHITECTURE.md` §9 Q3 — answer it in one place.)*
   §2.1 argues for *after*, because order-service is written against the
   catalogue contract and so costs nothing either way, whereas doing the split
   first delays this feature by a whole migration. The price of "after" is ~150
   lines of Phase 0 and Phase 2 TypeScript that later get ported. If the split
   is already imminent, say so and those two phases move into `course-service`
   from the start.
9. **What does `course-service` own, and in what stack?**
   *(Also tracked as `../ARCHITECTURE.md` §9 Q4.)* The natural boundary
   is `Course` + `Enrollment` + `Video`, because `Video.courseId` and the
   ownership checks in `middleware/ownership.ts` make Course and Video one
   aggregate in practice. That has a consequence worth deciding with open eyes:
   **`video-transcoder` has its own Prisma client pointed at the same Postgres
   and writes `Video` rows directly**, so moving `Video` means that service
   repoints too — either at a new schema or, better, at a `course-service`
   callback like the one it already uses for `POST /:videoId/processed`.
   Stack: Spring Boot would make three of five services consistent and reuse
   `notification-service`'s conventions wholesale; Node would let the existing
   `course.service.ts` / `videoUpload.controller.ts` move nearly as-is. This
   design has no stake in the answer — it deserves its own
   `course-service/SYSTEM_DESIGN.md` rather than a footnote in this one.

---

# Part IV — Resilience: circuit breakers and bulkheads

> **Status: proposed, awaiting review.** Nothing below is implemented.

## 17. HLD

### 17.1 Is a circuit breaker needed here? Yes — for one concrete reason

Timeouts already exist (catalogue 3s, Razorpay and Stripe 10s connect + 10s read). What
turns a slow payment provider into a **total order-service outage** is where the call is made:

`OrderCreationTx.attemptCreate`, `OrderLifecycleService.retry` and `RefundService.request` call
the provider **inside an open `@Transactional`**, so every in-flight provider call holds one of
Hikari's **10** pooled connections for as long as the provider takes — up to 20s when it hangs.

During a Razorpay brownout, ten buyers clicking *Buy* exhaust the pool. Then everything that
needs Postgres waits on Hikari's 30s connection timeout and fails, including:

- **webhooks** — so payments that *did* succeed are not confirmed, and the provider starts its
  retry schedule;
- `GET /orders/{id}` — so the frontend's confirm polling fails for every buyer;
- Stripe checkouts — an unrelated, healthy provider.

A timeout bounds how long *one* call waits. Nothing bounds how many wait at once, and nothing
stops the service from calling a provider it already knows is down. That is the job of two
patterns, and this design adds both:

| Pattern | What it stops |
|---|---|
| **Bulkhead** (concurrency limit per dependency) | one dependency holding more than *N* connections/threads — this is what protects the pool |
| **Circuit breaker** (per dependency) | calling a dependency that is failing: after a failure-rate threshold it rejects instantly for a cool-down, then lets a few probe calls through |

### 17.2 Where they go — and where they deliberately do not

| Outbound call | Breaker + bulkhead? | Why |
|---|---|---|
| `CatalogueClient` → backend `/internal/*` | **Yes** — breaker `catalogue` | on the purchase path, synchronous |
| `PaymentProvider.createCheckout` | **Yes** — one breaker per provider | on the purchase path, inside a DB transaction |
| `PaymentProvider.refund` | **Yes** — same per-provider breaker | inside a DB transaction; an admin gets a clean 503 |
| `PaymentProvider.fetch` (sweeper) | **Yes** — same per-provider breaker | stops the sweeper hammering a provider that is down; a skipped order is simply retried on the next sweep |
| Inbound webhooks | **Never** | rejecting a webhook rejects a money confirmation; the provider already retries |
| Outbox relay → Kafka | **No** | already decoupled from requests; it backs off and retries, and a breaker would only delay delivery |
| `verify` / `parse` | **No** | pure computation, no I/O |
| Redis rate limiter | **No** | already fails open within 0.5s |

**One breaker per provider, never one for all of them**: a Razorpay outage must leave Stripe
untouched. **Per replica, in memory**: each instance learns the provider's health from its own
calls. Sharing breaker state through Redis would put request-path correctness in Redis, which
the rules of this service forbid.

### 17.3 Behaviour when a breaker is open

- **Buying.** `POST /orders` and `/retry` check the provider's breaker **before** claiming the
  order slot (step ④). Open → `503 PROVIDER_UNAVAILABLE` with `Retry-After`, and no order row
  is written. If the breaker opens between the check and the call, the call fails fast,
  the transaction rolls back exactly as a transient provider failure does today, and the
  buyer's retry with the same idempotency key starts clean.
- **Choosing a provider.** `GET /orders/providers` gains an additive `unavailable` list, and
  `providers` lists only providers whose breaker is not open. The frontend already picks
  the first enabled provider from its preference list, so **a Razorpay outage silently falls
  through to Stripe** when both are enabled. This is the one place the breaker raises
  availability rather than only containing failure.
- **Catalogue down.** `503` "Purchases are temporarily unavailable" — the buy button's existing
  error path.
- **Refunds.** `503` to the admin; the refund row and transition roll back as today. **No
  automatic retry**: a Razorpay refund POST is not idempotent, and a retried refund that
  had actually landed is money sent twice.
- **Sweeper.** The fetch is rejected instantly, the order is counted `SKIPPED_PROVIDER_DOWN` in
  the sweep tally, and it is reconsidered next sweep.

**Health checks stay UP while a breaker is open.** Breaker state is reported in metrics, never in
readiness. If readiness turned DOWN, Kubernetes would take every replica out of rotation over a
third-party outage, and webhooks for the providers that still work would be refused.

### 17.4 What counts as a failure

Only `PROVIDER_TRANSIENT` — 5xx, timeouts, connection refused — and slow calls. A
`PROVIDER_PERMANENT` (4xx: a declined card, a bad request) or a catalogue 404 means the
dependency answered correctly, so it does **not** count. A breaker that opened on a run of
declined cards would block every other buyer.

### 17.5 Retries

The breaker adds **no retries**:

- **Catalogue `GET`s** get **one** retry after 200ms with jitter. They are idempotent, and a
  single dropped connection is common.
- **`createCheckout`** gets none. Razorpay order creation is not idempotent, and the buyer's
  retry with the same idempotency key is already the safe retry.
- **`refund`** never retries, for the reason above.

### 17.6 Library

**Resilience4j 2.x core modules** — `resilience4j-circuitbreaker`, `resilience4j-bulkhead` and
`resilience4j-micrometer` — wired as plain beans. **Not** the `resilience4j-spring-boot3`
starter: it targets Boot 3 and its auto-configuration is unverified on Boot 4.

Rejected:

- **Spring Cloud CircuitBreaker** — an extra abstraction over the same library, with no gain
  here.
- **Spring Framework 7's `@Retryable` / `@ConcurrencyLimit`** — they provide retry and a
  bulkhead, but no breaker.
- **A hand-rolled breaker** — the half-open state machine under concurrency is exactly the
  kind of code that is subtly wrong.

## 18. LLD

### 18.1 Layout

```
config/ResilienceProperties.java      record, bound to lms.order.resilience.*
config/ResilienceConfig.java          CircuitBreakerRegistry + BulkheadRegistry beans, Micrometer binding
resilience/Resilience.java            call(name, Supplier) — bulkhead → breaker → supplier; maps rejections
resilience/ResilientPaymentProvider.java  decorator: createCheckout / fetch / refund through Resilience
```

`PaymentProviderRegistry` wraps each injected provider in `ResilientPaymentProvider` when it
builds its `EnumMap`. **No provider class changes**, so the Part II extensibility rule holds:
a new provider gets a breaker without knowing breakers exist.

```java
public <T> T call(String name, Supplier<T> call)          // throws ApiException
public boolean isOpen(String name)                         // OPEN or FORCED_OPEN
public Duration retryAfter(String name)                    // remaining open wait, for Retry-After
```

Rejections map to the existing error model:

| Rejection | Becomes |
|---|---|
| `CallNotPermittedException` (breaker open) | `ApiException(PROVIDER_UNAVAILABLE)` → **503** + `Retry-After` |
| `BulkheadFullException` | the same 503 — "busy" and "down" look identical to a buyer |

`ErrorType` gains `PROVIDER_UNAVAILABLE(503)`. It stays distinct from `PROVIDER_TRANSIENT` so the
metrics can separate "we did not call" from "we called and it failed".

### 18.2 Configuration (defaults)

```properties
lms.order.resilience.breaker.sliding-window-size=20          # last 20 calls
lms.order.resilience.breaker.minimum-calls=10                # never judge on fewer
lms.order.resilience.breaker.failure-rate-threshold=50       # % transient failures to open
lms.order.resilience.breaker.slow-call-threshold=PT5S
lms.order.resilience.breaker.slow-call-rate-threshold=80
lms.order.resilience.breaker.open-wait=PT30S
lms.order.resilience.breaker.half-open-calls=3
lms.order.resilience.bulkhead.max-concurrent=4               # per dependency; 2 providers × 4 < pool of 10
lms.order.resilience.bulkhead.max-wait=PT0.1S
lms.payment.razorpay.connect-timeout=PT2S                    # split from read: a dead host fails in 2s, not 10
lms.payment.stripe.connect-timeout=PT2S
```

Per-dependency overrides use `lms.order.resilience.overrides.<name>.*` (names: `catalogue`,
`razorpay`, `stripe`, `mock`).

### 18.3 Contract change — additive

```json
GET /api/v1/orders/providers
{ "providers": ["STRIPE", "MOCK"], "unavailable": ["RAZORPAY"] }
```

### 18.4 Observability

Micrometer exports `resilience4j_circuitbreaker_state`, `…_calls` (by outcome) and
`resilience4j_bulkhead_available_concurrent_calls`. Every state transition is logged once at
`WARN`, e.g. `breaker razorpay CLOSED→OPEN (failure rate 60%)`. That log line is the alert.

### 18.5 Tests

- **`Resilience`, with a fake supplier:**
  - transient failures open the breaker at the threshold;
  - permanent failures never open it;
  - an open breaker rejects without calling, and the rejection becomes a 503 with `Retry-After`;
  - it goes half-open after the wait, and recovers on successful probes.
- **Bulkhead:** the 5th concurrent call is rejected while 4 are blocked on a latch.
- **`OrderCreationTx`:** with the breaker open, no order row is written.
- **`GET /orders/providers`:** an open provider is listed under `unavailable`.
- **Sweeper:** with the breaker open, nothing is fetched, the order is tallied
  `SKIPPED_PROVIDER_DOWN`, and it is untouched in the database.
- **`OrderFlowIntegrationTest` (Docker):** the mock provider forced to fail opens the breaker,
  and a webhook for an existing order is **still** processed. That last assertion is the whole
  point.

## 19. Phases

| Phase | Ships | Verified by |
|---|---|---|
| **R1** | `Resilience` + registry decorator + catalogue wrapping, `PROVIDER_UNAVAILABLE`, split connect timeouts, metrics, the unit tests above | `./mvnw clean test` |
| **R2** | `/providers` `unavailable` list; frontend shows "Payments are briefly unavailable — try again in *n*s" from `Retry-After`, and falls through to the next provider | controller test + frontend type-check/build |
| **R3** *(recommended, larger)* | move provider calls **out** of the DB transaction: claim the slot and commit, call the provider, then record the checkout in a second short transaction. The bulkhead stops being load-bearing for the pool; it stays as defence in depth. Needs a "CREATED with no checkout" resume path on retry. | Testcontainers flow + a crash-between-transactions test |
| Deferred | shared breaker state across replicas; adaptive concurrency limits | — |
