# Notification Service — System Design

Status: design agreed. Phase 1 **compiles with Maven** and Phase 1b (template seeding) is done — neither has run against Mongo/Kafka/SMTP yet (§12).
Owner: LearnSphere platform. Port `8085`. Java 21 / Spring Boot 4.0.3.

This document is the plan of record. `todo.md` in this folder is the original
brain-dump that seeded it; where the two disagree, this file wins.

Wider context: `../ARCHITECTURE.md` (system boundaries, the scaling plan),
`../DATABASE_DESIGN.md` §4 (collections, retention, the seeding gap).
Diagram: `../docs/diagrams/05-notification-delivery.eraser`, rendered in the
Eraser workspace **LearnSphere - System Architecture**.

**Who produces into it.** Today nothing does — `backend` still mails OTPs
directly via nodemailer (Phase 5 migrates that). The first real producer is
`order-service`, which publishes receipt, payment-failed and refund messages in
its Phase 3; that phase needs **no Java changes here**, which is the payoff of
the contract in §6.2. See `../order-service/SYSTEM_DESIGN.md` §9.2.

---

## 1. Purpose and scope

One service owns **every outbound message LearnSphere sends to a human**. Other
services describe *what happened*; this service decides *how that reaches the
user* and actually delivers it.

**In scope**


| Channel   | Provider                                                          | Phase                             |
| --------- | ----------------------------------------------------------------- | --------------------------------- |
| `EMAIL`   | SMTP (the Gmail account `backend/utils/sendMail.ts` already uses) | 1                                 |
| `PUSH`    | Firebase Cloud Messaging via `firebase-admin`                     | 2                                 |
| `SMS`     | TBD (Twilio / SNS)                                                | 5                                 |
| `WEBHOOK` | plain HTTP POST                                                   | reserved in the enum, unscheduled |


**Explicitly out of scope.** User profiles, auth, course logic, and *deciding
whether a notification is warranted*. Producers make that decision; this service
never reads the Postgres application database. Its only stores are its own Mongo
collections and Redis.

**Non-goals for now.** Scheduled/digest sending, user notification preferences
and opt-out, localisation. All three are natural later additions and the data
model leaves room for them, but nothing is built for them yet.

---



## 2. Where it sits

```
  backend (Express/TS :5000)  ─┐
  video-transcoder (:7000)    ─┼─▶  Kafka topic `notifications`
  any future service          ─┘            │
                                            ▼
                        ┌───────────────────────────────────┐
   REST (sync/admin) ──▶│   notification-service  :8085     │
   POST /api/v1/…       │                                   │
                        │  listener → orchestrator → sender │
                        └───┬───────────┬──────────────┬────┘
                            │           │              │
                      Mongo :27017  Redis :6379   providers
                   templates,        idempotency,   SMTP / FCM
                   notifications,    rate limits    (SMS later)
                   device_tokens
                            │
                    `notifications_retry` ──▶ `notifications_dlq`
```

Every box except the providers is already in the repo's root `docker-compose.yml`.
No new infrastructure is needed.

---



## 3. Design decisions and why


| Decision                                                        | Rationale                                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Kafka is the primary inbound path**, REST is secondary        | Producers must not block on SMTP. If this service is down, events wait in the log instead of failing a user's signup.                                                                      |
| **REST publishes to the same topic** rather than sending inline | One pipeline, one set of semantics. The HTTP endpoint returns `202 Accepted` with a `notificationId`; it is a convenience for testing and admin tools, not a second code path to maintain. |
| **One message can name several channels**                       | `"channels": ["EMAIL","PUSH"]` fans out inside this service. Adding SMS to an existing notification later becomes a one-word producer change, not a new integration.                       |
| **Templates live in Mongo, not in the jar**                     | Marketing/content edits ship without a redeploy. This is the main reason the existing `Template` entity was already Mongo-backed.                                                          |
| **One** `notifications` **row per (notificationId, channel)**   | "The email sent but the push failed" is a real and common outcome; a single status field per message cannot express it.                                                                    |
| **Idempotency in Redis, keyed by attempt**                      | Kafka is at-least-once. Including the attempt number means a *redelivery* is suppressed while a genuine *retry* still goes through.                                                        |
| **Retries on a separate topic, never** `Thread.sleep`           | Blocking the consumer to wait out a backoff stalls the whole partition and starves unrelated tenants.                                                                                      |
| **Errors classified** `TRANSIENT` **vs** `PERMANENT`            | A missing template or malformed address will fail identically forever; retrying it just burns the DLQ budget and delays real work.                                                         |
| **Tenant id on every request**                                  | The service was scaffolded multi-tenant (`NotificationApiFilter`, `NotificationContextHolder`). Keeping that discipline now is far cheaper than retrofitting it.                           |


---



## 4. Package layout

```
com.lms.notification_service
├── config/       KafkaTopicConfig (+ MailConfig, PushConfig as they land)
├── constants/    ApplicationConstants
├── models/
│   ├── domain/   ChannelType, NotificationStatus, ErrorType,
│   │             RenderedContent, SendResult
│   ├── context/  NotificationContext, NotificationContextHolder   (existing)
│   ├── entity/   AbstractEntity (existing), Template, Notification, DeviceToken
│   ├── event/    NotificationMessage, NotificationTarget          ← Kafka contract
│   └── request/  SendNotificationRequest, TemplateRequest, DeviceRegisterRequest
├── repository/   NotificationRepository, TemplateRepository, DeviceTokenRepository
├── kafka/        NotificationListener, NotificationProducer  (+ RetryProducer, Dlq)
├── service/      NotificationService, TemplateService, IdempotencyService
│                 (+ RetryService, RateLimitService)
├── channel/      ChannelSender, ChannelSenderRegistry
│                 ├── email/ EmailSender
│                 ├── push/  PushSender     (Phase 2)
│                 └── sms/   SmsSender      (Phase 5)
├── controller/   NotificationController, TemplateController, DeviceController
├── exception/    AbstractException + GlobalExceptionHandler       (existing)
├── filters/      NotificationApiFilter                            (existing)
└── utils/        CommonUtils                                      (existing)
```



### The extensibility hinge

Everything channel-specific sits behind one interface:

```java
public interface ChannelSender {
    ChannelType channel();
    SendResult  send(Notification n, NotificationTarget target, RenderedContent content);
    String      resolveTarget(NotificationTarget target);
}
```

`ChannelSenderRegistry` takes Spring's injected `List<ChannelSender>` and keys it
into an `EnumMap`. The orchestrator only ever asks the registry for a channel.

**Adding SMS later is therefore exactly three things**, none of which touch the
orchestrator, the listener, the schema, or any producer:

1. `channel/sms/SmsSender implements ChannelSender`, annotated `@Component`.
2. The provider dependency and its credentials in `application.properties`.
3. An `SMS` row in the `templates` collection.

`ChannelType.SMS` already exists in the enum, so a producer can start *asking*
for SMS before the sender exists — it records a `PERMANENT` "no sender
registered" failure rather than crashing, which is the behaviour we want.

---



## 5. Data model (MongoDB)



### `templates`

Unique on `(tenantId, name, channel)`.


| Field                    | Notes                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| `id`                     | String                                                              |
| `tenantId`, `name`       | lookup key, e.g. `account-activation`                               |
| `channel`                | one template per channel — email HTML and a push title/body differ  |
| `subject`                | email subject / push title; supports placeholders                   |
| `templateMessage`        | body; HTML for email, plain text for push and SMS                   |
| `templateVariables`      | declared placeholders → default value (`null` = caller must supply) |
| `active`, `version`      | `version` bumps on edit; `active=false` retires without deleting    |
| `createdAt`, `updatedAt` | from `AbstractEntity`                                               |


Rendering is deliberately simple `{{variable}}` substitution — no Thymeleaf, no
EJS. An unresolved placeholder raises a **permanent** error instead of mailing a
literal `{{name}}` to a user.

### `notifications`

Unique on `(notificationId, channel)` — the delivery ledger.

`notificationId` (shared across the channel rows of one message), `tenantId`,
`userId`, `channel`, `target`, `templateName`, `variables`, `status`, `attempts`,
`provider`, `providerMessageId`, `errorType`, `errorMessage`, timestamps.

`status`: `PENDING → SENT | FAILED | RETRYING`.

### `device_tokens`

FCM registration tokens: `tenantId`, `userId`, `token` (unique), `platform`
(`WEB | ANDROID | IOS`), `active`.

Collected from Phase 1 via `POST /api/v1/devices` even though `PushSender`
arrives in Phase 2 — so that when push turns on there is already an audience.
A token FCM reports as unregistered gets `active=false` rather than deleted.

---



## 6. Contracts



### 6.1 Topics


| Topic                 | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `notifications`       | main inbound                                            |
| `notifications_retry` | transient failures awaiting backoff                     |
| `notifications_dlq`   | permanent failures and exhausted retries; manual replay |


All three are declared as `NewTopic` beans so they exist from first boot rather
than relying on auto-creation.

### 6.2 `NotificationMessage` — the contract every producer codes against

Key: `userId`, so one user's notifications stay ordered.

```json
{
  "notificationId": "8f3c…",
  "tenantId": "learnsphere",
  "userId": "clx123…",
  "channels": ["EMAIL", "PUSH"],
  "templateName": "account-activation",
  "target": {
    "email": "student@example.com",
    "phone": null,
    "deviceTokens": ["fcm-token-…"]
  },
  "variables": { "name": "Kshitij", "activationCode": "4821" },
  "attempt": 0
}
```

`notificationId` is the producer's idempotency handle: replaying the same id
replays the same claim, so a producer that crashes mid-publish can safely resend.

This schema is **additive-only**. New optional fields are fine; renaming or
removing one is a breaking change for every producer.

### 6.3 REST API

All paths require the `x-tenant-id` header — `NotificationApiFilter` rejects
anything under `/api` without it.


| Method   | Path                                     | Purpose                             |
| -------- | ---------------------------------------- | ----------------------------------- |
| `POST`   | `/api/v1/notifications`                  | enqueue; `202` + `notificationId`   |
| `GET`    | `/api/v1/notifications/{notificationId}` | per-channel delivery rows           |
| `GET`    | `/api/v1/notifications/user/{userId}`    | user history                        |
| `POST`   | `/api/v1/templates`                      | upsert a template (bumps `version`) |
| `GET`    | `/api/v1/templates` · `/{name}?channel=` | list / fetch                        |
| `POST`   | `/api/v1/devices`                        | register an FCM token               |
| `DELETE` | `/api/v1/devices/{token}`                | deactivate                          |


---



## 7. Delivery flow

```
Kafka record on `notifications`
  │
  ├─ parse JSON ─── fails ──▶ log + discard (a poison record must not stall the partition)
  │
  └─ for each channel in message.channels():
       │
       ├─ Redis claim  notif:idem:{tenant}:{id}:{channel}:{attempt}
       │     already held ──▶ skip, it's a redelivery
       │     Redis down   ──▶ proceed anyway (at-least-once beats not-at-all)
       │
       ├─ load or create the notifications row, attempts++
       ├─ look up template (tenant, name, channel)   ─ missing ─▶ PERMANENT
       ├─ render {{variables}}                       ─ unresolved ─▶ PERMANENT
       ├─ registry.get(channel).send(…)              ─ none ─▶ PERMANENT
       │
       └─ SendResult
            success   ──▶ status SENT, store providerMessageId
            TRANSIENT ──▶ status RETRYING, republish to notifications_retry   (Phase 3)
            PERMANENT ──▶ status FAILED,   publish to notifications_dlq       (Phase 3)
```

A failure on one channel never prevents the others from being attempted — the
loop catches per channel.

### Error classification


| Classification      | Examples                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `PERMANENT`         | template missing/unrenderable, no sender for channel, missing or malformed address, SMTP auth rejected, FCM `UNREGISTERED` token |
| `TRANSIENT`         | SMTP timeout or 4xx greylisting, FCM 5xx/quota, Mongo or network blip                                                            |
| `EXHAUSTED_RETRIES` | transient, but past `max-attempts` — lands in the DLQ                                                                            |


---



## 8. Reliability

**Idempotency.** `SETNX` with a 24h TTL on
`notif:idem:{tenantId}:{notificationId}:{channel}:{attempt}`. A Redis outage
fails *open* — a duplicate email is a better outcome than a missing one.

**Retry (Phase 3).** Spring Kafka's `@RetryableTopic` with exponential backoff
across delay-tiered topics, defaulting to 4 attempts at roughly 30s / 2m / 10m.
The listener will rethrow a `TransientDeliveryException` to trigger it; permanent
failures stay swallowed and go straight to the DLQ. Non-blocking by construction,
so a slow provider degrades one tenant's throughput rather than everyone's.

**DLQ.** `notifications_dlq` keeps the original payload plus the failure reason.
Phase 3 adds an admin replay endpoint; until then it is inspected through Kafka
UI on `:8080`.

**Template seeding — a real operational hole, not a nicety.** Nothing seeds
Mongo today, so a fresh `docker compose up` leaves `templates` empty and
**every** notification fails `PERMANENT` with "template missing". The service
looks healthy and delivers nothing. Decision: a `resources/templates/*.json`
set plus an `ApplicationRunner` that upserts them on boot, active in the `dev`
profile and opt-in by flag elsewhere (`lms.notification.seed-templates`), so
production content edits are never overwritten by a redeploy. Seeded by name and
channel, skipping any row whose `version` is higher than the file's.
This lands in **Phase 1b** rather than being carried as an open question,
because the service is not usable by a new contributor without it.

**Rate limiting (Phase 4).** Redis sliding window per `(tenantId, channel)` to
respect provider quotas, and per `(userId, templateName)` so a producer bug
cannot mail one user two hundred times. Over-limit messages go to the retry
topic rather than being dropped.

**Ordering.** Partitioning by `userId` gives per-user ordering. There is no
global ordering guarantee and none is needed.

---



## 8.1 Scalability

Replicas are safe by construction, and the reasons are worth stating because
they are all consequences of earlier decisions rather than later additions.

| Property | Why |
|---|---|
| **N replicas** | Stateless; the Redis `SETNX` claim per `(notificationId, channel, attempt)` means two consumers cannot send the same thing twice |
| **Throughput ceiling** | The consumer group is bounded by the partition count of `notifications`. Raise partitions before replicas — consumers above the count sit idle |
| **A slow provider** | Never blocks the partition, because retries go to `notifications_retry` and the listener does not sleep. This is the single most important scaling property in the service |
| **Per-channel isolation** | One message naming `["EMAIL","PUSH"]` fans out in a per-channel loop with its own try/catch, so a failing push does not cost the email |

**Where it gives way, in order:**

1. **SMTP is the slow leg**, typically hundreds of milliseconds and sometimes
   seconds. At 10k/hour (`../ARCHITECTURE.md` §6.4) that is comfortably within
   one replica; a bulk campaign is a different shape entirely and is what the
   rate limiting in Phase 4 exists to contain.
2. **One tenant starving another.** The Phase 4 sliding window is per
   `(tenantId, channel)` precisely so a single tenant's blast cannot consume the
   provider quota everyone shares. Over-limit messages go to the retry topic
   rather than being dropped.
3. **The `notifications` ledger grows forever.** It needs a TTL index — 90 days
   per `../DATABASE_DESIGN.md` §9 — and `tenantId` is the shard key if a second
   tenant ever arrives at volume.
4. **Fan-out to many recipients.** The contract is deliberately one message per
   user, so a campaign is N messages rather than one large one. That keeps
   per-user ordering and retry granularity, at the cost of N producer publishes
   — the right trade, and worth not "optimising" away later.

## 9. Multi-tenancy

`NotificationApiFilter` pulls `x-tenant-id` off every `/api` request into a
`ThreadLocal` (`NotificationContextHolder`), cleared in a `finally` block so a
pooled thread can never leak one tenant's id into another's request. Kafka
messages carry `tenantId` in the payload instead; a message without one is
dropped with a warning rather than defaulted.

Every Mongo query is scoped by `tenantId` — templates, history, device tokens.
LearnSphere is single-tenant today (`learnsphere`), so this costs almost nothing
now and is the kind of thing that is painful to add later.

---



## 10. Configuration

Everything is env-overridable with local-dev defaults matching `docker-compose.yml`.


| Key                                                             | Default                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `MONGODB_URI`                                                   | `mongodb://mongo:mongo123@localhost:27017/notifications?authSource=admin` |
| `KAFKA_BROKERS` / `KAFKA_GROUP_ID`                              | `localhost:9092` / `notification-service`                                 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`                  | `localhost` / `6379` / `local`                                            |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER_EMAIL` / `SMTP_PASSWORD` | Gmail, `465` — same account as the backend                                |
| `lms.notification.topics.*`                                     | `notifications`, `notifications_retry`, `notifications_dlq`               |
| `lms.notification.idempotency-ttl`                              | `PT24H`                                                                   |
| `FIREBASE_CREDENTIALS`                                          | *(Phase 2)* path to the service-account JSON                              |


Run with `make notification` from the repo root, or `./mvnw spring-boot:run`.

---



## 11. Observability

Actuator is already on the classpath. Phase 4 adds
`micrometer-registry-prometheus` and these counters, all tagged by tenant and
channel: `notifications_received_total`, `notifications_sent_total`,
`notifications_failed_total{errorType}`, `notifications_dlq_total`, plus a
send-latency histogram. Logs carry `notificationId`, `tenantId` and `channel` on
every line so one delivery can be traced end to end.

Two gauges matter more than the counters, because they are what you alert on:
**retry-topic depth** and **DLQ depth**. A rising DLQ is almost always one
broken template or one bad credential affecting every message of a kind — it is
a single fix, and the only question is how long it takes to notice. Alert on any
non-zero DLQ rate rather than on a threshold.

Once a trace id is propagated on the Kafka header
(`../ARCHITECTURE.md` §5.2), a receipt email joins the same trace as the
purchase that caused it, which is the point at which "did the user get told"
stops being a log search.

---



## 12. Phased plan



### Phase 0 — scaffold repair ✅

The existing scaffold had three pieces that silently did nothing:
`NotificationApiFilter` was never registered as a bean (and NPE'd on a missing
header, and continued the chain after writing its 401); `GlobalExceptionHandler`
had no `@RestControllerAdvice`; and `CommonUtils.getCurrentTimeStamp()` returned
one frozen value from a static `Calendar` built at class-load, while
`isNotEmpty()` returned `isEmpty()`. All fixed. `application.properties` gained
the Mongo/Kafka/Redis/SMTP configuration it was missing.

### Phase 1 — email end-to-end ✅ compiles, ⚠️ not yet run

Domain enums, the three entities and repositories, the `NotificationMessage`
contract, `KafkaTopicConfig`, `NotificationListener`/`NotificationProducer`,
`TemplateService`, `IdempotencyService`, `NotificationService`, `EmailSender`,
and the three controllers.

> **Compiled — after two fixes the first real compile surfaced.**
> `./mvnw -o compile` from a clean `target/` now succeeds. Fixed on the way:
>
> - `NotificationService` caught `AbstractException`, which is an *interface*, not a
>   `Throwable` — that line could never compile. It now catches
>   `ResourceNotFoundException | ValidationException`, the two exceptions that
>   implement it.
> - `NotificationListener` / `NotificationProducer` injected Jackson **2**'s
>   `ObjectMapper`. Boot 4 auto-configures only Jackson **3** (`tools.jackson`)
>   unless `spring-boot-jackson2` is added, so both beans would have failed at
>   startup. Both now use Jackson 3.
>
> Still unrun: `./mvnw test` (the context test needs Mongo + Kafka), and a real send.



### Phase 1b — template seeding

`resources/templates/*.json` plus the `ApplicationRunner` described in §8, and
the three commerce templates `order-receipt`, `payment-failed`,
`refund-processed` alongside `account-activation`. Small, and it is what makes
the service work on a clean checkout.
**Verify:** `docker compose down -v && docker compose up -d`, start the service,
and a published `NotificationMessage` renders instead of failing `PERMANENT`.

> **Status: done (compiled, not run).** `config/TemplateSeeder` reads
> `classpath:seed-templates/*.json` — not `templates/`, which Spring reserves for view
> templates — and inserts any `(tenant, name, channel)` that is missing, so edits made
> through `POST /api/v1/templates` survive restarts. Ships `order-receipt`,
> `payment-failed`, `refund-processed`; every placeholder they use is declared in
> `templateVariables`. Off with `SEED_TEMPLATES=false`. **Not yet ported:**
> `account-activation` (from `backend/views/activationMail.ejs`) — it is only needed
> for the Phase 5 backend cutover.

### Phase 2 — push via FCM

`firebase-admin` dependency, `FirebaseConfig` reading a service-account JSON,
`PushSender` using `sendEachForMulticast` over the user's active tokens,
deactivating tokens FCM reports as `UNREGISTERED`. Frontend side: a service
worker, `getToken()`, and a `POST /api/v1/devices` call after login.

### Phase 3 — retry, DLQ, replay

`@RetryableTopic` backoff, DLQ publishing with the failure reason, an admin
replay endpoint.

### Phase 4 — rate limiting and metrics

Redis sliding windows; Prometheus counters and a Grafana dashboard.

### Phase 5 — SMS, and the backend cutover

`SmsSender` (three steps, §4). Separately, migrate the OTP mail: port
`backend/views/activationMail.ejs` into an `account-activation` template row,
replace the `sendMail()` call in `registerUser` with a Kafka publish, then delete
the backend's nodemailer path. Deliberately last — signup works today and there
is no reason to put it at risk before the delivery path has proven itself.

---



## 13. Open questions

- **Tenant id type.** The scaffold's `Template` used `UUID` for `id`/`tenantId`
while `NotificationContext` used `String`. Standardised on `String` so tenants
can be readable slugs like `learnsphere`. Flagging it as a deliberate change.
- **SMS provider** — Twilio or AWS SNS. Not needed until Phase 5.
- **`{{name}}` in templates needs the buyer's name**, which the access token
does not carry. Either add `name` to `generateAccessToken`'s claims — one line,
and every future service gets it free — or add `GET /internal/users/:id`.
**Recommendation: the token claim.** It is a change to `backend`'s token
contract, so it is tracked as `../ARCHITECTURE.md` §9 Q6 and should be answered
once, there.
- **User preferences / opt-out.** Where does "this user muted course emails"
live — here, or in the backend's Postgres? Leaning towards here, as a
`notification_preferences` collection consulted before dispatch, but it is
unscheduled.
- **Attachments.** `MimeMessageHelper` is currently created with
`multipart=false`. Certificates or invoices as PDFs would need that flipped
and an S3 reference added to the contract.


---

## 14. Critical notifications — availability

> **Status: proposed, awaiting review.** Nothing below is implemented.

### 14.1 The problem

Most messages can arrive late. An order receipt that arrives after ten minutes is fine. **An
account activation code cannot**: its token expires **5 minutes** after it is issued
(`backend/services/user.service.ts`). Until that email arrives, the user cannot use the
product at all. Password reset and login OTPs, when they exist, share that property. This
section is about that class of message — *critical* ones — and treats every other message
exactly as today.

**Goal:** an activation email reaches the inbox within the code's lifetime even when one of
these is degraded — the SMTP provider, one notification-service instance, Redis, or a backlog
of other notifications. When that is impossible, the user can always get a fresh code
themselves.

**Not a goal:** exactly-once delivery (a duplicate activation email is harmless), or moving
receipts to a faster lane.

### 14.2 What fails today

| # | Failure | Effect today | Fix |
|---|---|---|---|
| 1 | The retry schedule is 30s → 2m → 8m and the code lives 5m | retries 3 and later send an email whose code **has already expired** — worse than none, because it looks like a bug in the product | a **critical retry schedule** that fits inside the lifetime, and an `expiresAt` on the message: past it, the message is marked `EXPIRED`, not sent |
| 2 | Activation shares the `notifications` topic with receipts, keyed by user | a receipts burst, or one slow SMTP send, queues activation behind it on the same partition (head-of-line blocking) | a separate **`notifications.critical`** topic with its own listener container |
| 3 | One shared `email` quota of 300/min | a bulk send starves sign-ups; an over-limit activation waits on 30s+ retry topics | critical messages are **exempt from the channel quota**; the per-user-per-template limit (5 in 10 minutes) stays, because the resend button is the abuse vector |
| 4 | **One SMTP account** (Gmail) | Gmail's daily sending cap, an auth failure or account suspension stops *all* email | **ordered email providers with failover**, each behind its own circuit breaker |
| 5 | One instance of this service | a deploy or crash means no email until it is back | ≥ 2 replicas (topics already have 3 partitions); the prod Kafka/Mongo replication below |
| 6 | Kafka down when the backend publishes | the account is created, no email is queued, `emailQueued: false`, the user must press *resend* | short bounded in-request publish retries in the backend; keep the self-service resend as the guarantee (backend outbox deferred, §14.6) |
| 7 | Redis down | idempotency and rate limiting already fail open | none — already right |

Item 1 is a live bug, not a hypothetical. Items 2–4 are the availability work. Item 5 is
deployment.

### 14.3 HLD

```
backend ──(priority CRITICAL)──▶ notifications.critical ──▶ CriticalNotificationListener ─┐
        ──(NORMAL, as today)───▶ notifications          ──▶ NotificationListener ─────────┤
                                                                                           ▼
                                                    NotificationService.process(message, attempt)
                                                      expiresAt passed? → EXPIRED, stop
                                                      CRITICAL → skip channel quota
                                                                                           ▼
                                               EmailSender → providers [primary, secondary, …]
                                                             each behind a circuit breaker;
                                                             TRANSIENT on one → next one now
```

- **Two lanes, one pipeline.** The critical lane has its own topic, its own consumer
  container and its own retry topics, so its lag is independent of the normal lane's.
  Rendering, the ledger, idempotency and the senders are shared. There is exactly one
  definition of "deliver a notification".
- **The producer chooses the lane** by topic. The message also carries `priority`, so a
  critical message published to the old topic is still treated as critical — just without the
  isolation.
- **Failover happens inside one attempt.** If the primary SMTP provider returns a transient
  error, or its breaker is open, the same attempt tries the secondary *immediately* instead of
  waiting for a retry topic. A **permanent** error (550 mailbox unknown) is not retried on
  another provider — it would be rejected there too.

### 14.4 Contract — additive (§6)

```json
{
  "...": "every existing field, unchanged",
  "priority": "CRITICAL",
  "expiresAt": "2026-10-08T10:05:00Z"
}
```

- `priority`: `CRITICAL | NORMAL`. Absent means `NORMAL`, so every existing producer is
  unaffected.
- `expiresAt`: optional ISO-8601. Absent means never.

The backend sets `priority: CRITICAL` and `expiresAt` to the activation token's `exp`, and
publishes to `notifications.critical`.

### 14.5 LLD

**Topics and retry** (critical lane):

| | Normal (today) | Critical |
|---|---|---|
| Topic | `notifications` | `notifications.critical` |
| Retry topics | `notifications_retry-N` | `notifications.critical_retry-N` |
| DLT | `notifications_dlq` | `notifications.critical_dlq` |
| Attempts | 4 | 5 |
| Backoff | 30s × 4, ≤ 10m | 5s, 15s, 45s, 90s (≈ 2.6 min total — inside the 5-min code) |
| Listener concurrency | 1 | 3 (one per partition) |

`CriticalNotificationListener` is a second `@RetryableTopic` class, bound to
`lms.notification.critical.*`. Its `@DltHandler` calls the same `exhausted(...)`.

**Expiry.** `NotificationService.process` checks `expiresAt` first, before rendering, on every
attempt, including replays. A passed `expiresAt` marks the row `EXPIRED` (a new
`NotificationStatus`) and writes **no** dead letter, because there is nothing to replay: the
user needs a new code, not the old email.

**Rate limit.** In `RateLimitService.allow(...)`, `CRITICAL` skips the channel window; the
user-template window applies to both lanes.

**Email failover:**

```java
interface EmailProvider { String name(); void send(RenderedEmail email) throws MailException; }
class SmtpEmailProvider implements EmailProvider   // one JavaMailSenderImpl per configured account
class EmailSender implements ChannelSender         // tries providers in order
```

```properties
lms.notification.email.providers[0].name=primary
lms.notification.email.providers[0].host=${SMTP_HOST}
lms.notification.email.providers[0].port=${SMTP_PORT:465}
lms.notification.email.providers[0].username=${SMTP_USER_EMAIL}
lms.notification.email.providers[0].password=${SMTP_PASSWORD}
lms.notification.email.providers[1].name=secondary            # optional; e.g. SES SMTP, Brevo, Mailgun
lms.notification.email.providers[1].host=${SMTP2_HOST:}
lms.notification.email.providers[1].from=${SMTP2_FROM:}
lms.notification.email.breaker.failure-rate-threshold=50
lms.notification.email.breaker.open-wait=PT60S
```

With one provider configured, behaviour is exactly today's. Today's `spring.mail.*` keys map
onto `providers[0]`, so existing `.env` files keep working. The breakers use
**Resilience4j**, the same library and semantics as order-service Part IV.

`SendResult` records which provider sent the message (`providerName` on the ledger row).
That makes "is the secondary carrying traffic?" one query.

**Backend (producer):**

- `publishActivationEmail` publishes to `KAFKA_TOPIC_NOTIFICATIONS_CRITICAL`, default
  `notifications.critical`.
- It sets `priority` and `expiresAt`, taking `expiresAt` from the activation token.
- The producer gets `retry: { retries: 3, initialRetryTime: 200 }` and a **3s** overall budget,
  so a Kafka blip does not cost the user a resend, and a Kafka outage does not hang sign-up.

**Metrics:**

- `notifications_expired_total{template}`
- `notifications_provider_failover_total{from,to}`
- the end-to-end delay `notifications_critical_age_seconds` (from `createdAt` to sent) — the
  number to alert on: p99 above 60s.

### 14.6 Deployment and deferred

- **Production:**
  - **≥ 2 replicas**; partitions stay at 3, which bounds useful replicas at 3 per lane.
  - **Kafka** `replication.factor=3`, `min.insync.replicas=2`, producers `acks=all` (the
    kafkajs and Spring defaults).
  - **Mongo** as a 3-member replica set.
  - Local docker compose stays single-node; that is fine for development and is said so in
    `ARCHITECTURE.md`.
- **Deferred — backend transactional outbox for activation.** It would make "account created but
  email never queued" impossible. It is deferred because the user can already self-heal with
  *resend*, the publish now retries, and `backend/` is about to be split into auth-service,
  which is where an outbox belongs.
- **Deferred — SMS as a fallback channel** for activation. Users give no phone number at
  sign-up.
- **Recorded, separate fix:** the activation code is 4 digits from `Math.random()`. It should
  be 6 digits from `crypto.randomInt`. This is not part of this section's scope, but it sits
  on the same code path.

### 14.7 Tests

- **Unit:**
  - an expired message is marked `EXPIRED` with no send and no dead letter;
  - `CRITICAL` bypasses the channel quota, but not the user-template limit;
  - `EmailSender` fails over on a transient error, does not fail over on a permanent one, and
    skips a provider whose breaker is open;
  - one configured provider behaves exactly as today.
- **Embedded Kafka:**
  - a critical message is delivered while the normal topic holds a 500-message backlog that a
    deliberately slow fake sender is chewing through;
  - a critical message whose first attempt fails transiently arrives on `critical_retry-0`
    and is sent within the 5s backoff.
- **Backend:**
  - `activationMessage` sets `priority` and `expiresAt` from the token;
  - publishing retries, then gives up inside its budget.

### 14.8 Phases

| Phase | Ships |
|---|---|
| **H1** | contract fields; `EXPIRED` + the expiry check; backend sets `priority`/`expiresAt` (still on the old topic). **Fixes the expired-code bug on its own.** |
| **H2** | the critical lane: topic, listener, retry schedule, quota exemption; backend switches topic + bounded publish retries |
| **H3** | email provider failover with breakers; `providerName` on the ledger |
| **H4** | deployment HA: replicas, Kafka/Mongo replication in `deploy/`, alert on `notifications_critical_age_seconds` |
| Deferred | backend outbox (with auth-service), SMS fallback |
