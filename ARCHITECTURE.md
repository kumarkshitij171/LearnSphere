# LearnSphere — System Architecture

Status: **architecture of record.** Current state is verified against the code;
the target state and the scaling plan are design for review.

This is the system-wide view. Each service additionally carries its own
`SYSTEM_DESIGN.md` with its HLD, LLD and numbered phase plan, and the data layer
has `DATABASE_DESIGN.md`. Where this document and a service document disagree
about that service's internals, **the service document wins**; where they
disagree about a boundary between services, **this one wins**.

Diagrams: `docs/diagrams/` holds the checked-in diagram-as-code sources, rendered
in the shared Eraser workspace **LearnSphere - System Architecture**. Edit the
sources, then re-paste, so the two never drift.

---

## 1. What LearnSphere is

A video-first learning management platform. Instructors publish courses and
upload video that is transcoded to adaptive HLS; students buy or enrol, then
stream. Three roles — `STUDENT`, `INSTRUCTOR`, `ADMIN` — with students
requesting instructor access and admins approving it.

**The architectural shape follows from one property of the product:** the
expensive work (transcoding) and the money work (payments) must not sit on the
request path of the cheap work (browsing, watching). Everything below is a
consequence of separating those three.

### What it is not

Not a live-streaming platform, not a social network, not a general CMS. No
real-time collaboration. Those would change the design materially, so they are
named here to keep them out.

---

## 2. Service map

| Service | Stack | Port | Owns | State today |
|---|---|---|---|---|
| `frontend/` | Next.js 14 App Router, React 18, Tailwind, axios, hls.js | 3000 | All browser UI | **Working** |
| `backend/` | Express + TypeScript, Prisma | 5000 | `User`, auth, RBAC, `Course`, `Enrollment`, `Video`, presign, internal API | **Working** |
| `video-transcoder/` | Node + TypeScript (ESM, tsx), FFmpeg | 7000 | Transcode `video.uploaded` → HLS; serve HLS from S3 | **Working** |
| `order-service/` | Spring Boot / Java | 8086 | `Order`, `Payment`, `Refund` | **Scaffold only** |
| `notification-service/` | Spring Boot 4.0.3 / Java 21 | 8085 | Every outbound message to a human | **Phase 1 written, build unverified** |

Two services are Node, two are Spring, one is Next.js. That is a deliberate
polyglot split rather than an accident: the IO-bound, S3-and-FFmpeg-shaped work
is Node, and the transactional, money-and-delivery-shaped work is Spring, where
`@Transactional`, Flyway and Spring Data earn their keep.

### 2.1 The boundaries that matter

Three rules carry most of the design. Each is enforced by structure, not by
convention.

> **① `order-service` never opens the application database.**
> It learns about courses over one HTTP call and announces payments over Kafka.
> Enrolment is granted by the catalogue owner consuming `order.paid`.

The cost is eventual consistency for a few hundred milliseconds after payment.
The benefit is that the `Enrollment` invariants live in exactly one service, and
that moving the course domain out of `backend/` later costs `order-service`
nothing. See `order-service/SYSTEM_DESIGN.md` §2.

> **② `notification-service` decides nothing.**
> Producers decide that a notification is warranted and publish a ready-made
> `NotificationMessage`. The service only renders and delivers.

> **③ A webhook is the only thing that can mark money as received.**
> A browser redirect tells the UI to start polling. It never advances an order.

### 2.2 Known divergences between code and docs

Recorded because they are the kind of thing that quietly misleads:

| Divergence | Reality |
|---|---|
| Root `CLAUDE.md` says the transcoder serves "a checked-in local HLS sample" | **Stale.** `video-transcoder/src/index.ts` streams from the processed S3 bucket with `Range` support |
| Root `CLAUDE.md` says the general rate limit is 100 req | It is `RATE_LIMIT_MAX` or **1000** per IP per 15 min (`backend/app.ts:44`) |
| Backend port | `index.ts` uses `PORT || 5000`; the frontend defaults to `:5001`. Pick one — §9 |
| Transcoder port | Service defaults to `7000`; `frontend/src/config/env.ts` defaults to `:7070`. Pick one — §9 |
| `deploy/lms-deployment.yaml` | Declares `containerPort: 3000` for the backend and 1 replica everywhere. Does not match any service's real port — §8 |
| `order-service/pom.xml` | Java 17 / Boot 4.1.1 / `com.learnsphere.order_service`, against a design that says Java 21 / Boot 4.0.3 / `com.lms.order_service`. **Decision: align the scaffold to `notification-service`** — Phase 1 of its design |

---

## 3. Current topology

What actually runs today, with `make start` plus `docker compose up -d`.
Diagram: `docs/diagrams/02-current-topology.eraser`.

```
  Browser
     │
     ▼
  frontend :3000  ──HTTP(cookie)──▶  backend :5000
     │                                  │
     │                                  ├─▶ Postgres :5434   (Prisma, schema public)
     │                                  ├─▶ Redis :6379      (OTP, session)
     │                                  ├─▶ LocalStack :4566 (S3 presign + put)
     │                                  └─▶ Kafka :9092      (produce video.uploaded)
     │                                            │
     │                                            ▼
     └──HLS GET──────────────▶  video-transcoder :7000  (consume, FFmpeg, S3 r/w,
                                        │                 callback to backend,
                                        │                 serve HLS from S3)
                                        └─▶ LocalStack S3
                                           (no DB: its Prisma client is dead
                                            code — DATABASE_DESIGN.md §3.2)

  notification-service :8085 ─▶ Mongo :27017 · Redis · Kafka   (consumers written, unverified)
  order-service :8086        ─▶ nothing yet                    (Spring scaffold)
```

All infrastructure is local containers. **AWS vs LocalStack is one flag**,
`LOCAL_STACK_DATA_SOURCE`, read in `backend/config/awsConfig.ts` and
`video-transcoder/src/config/conf.ts`. Nothing else in either codebase knows
which it is talking to, which is why the production cutover is configuration
rather than a rewrite.

---

## 4. Target architecture

Diagram: `docs/diagrams/01-system-architecture.eraser`.

```
  Student / Instructor
        │
        ▼
   Route 53  ──▶  CloudFront  ──▶  s3://processed-videos   (HLS segments, signed)
        │                                   ▲
        └──▶  ALB / Ingress (ONE origin)    │
                 │                          │
                 ├─ /                 ─▶ frontend
                 ├─ /api/v1/users/*   ─▶ auth-service
                 ├─ /api/v1/courses/* ─▶ course-service ──┐
                 ├─ /api/v1/orders/*  ─▶ order-service    │
                 └─ /hls/*            ─▶ (CloudFront)     │
                                                          │
   Kafka / MSK ──── order.paid · order.refunded ───────────┘
              ──── video.uploaded ──▶ video-transcoder ────▶ s3 buckets
              ──── notifications ──▶ notification-service ─▶ SES/SMTP · FCM · SMS

   s3://raw-videos ──ObjectCreated──▶ SNS ──▶ SQS ──▶ bridge ──▶ Kafka

   Postgres: schema auth · schema course · schema orders      Mongo: notifications
   Redis: OTP · idempotency · rate limits · sweeper leader election
```

### 4.1 The four changes from today

| Change | Why now | Phase |
|---|---|---|
| **One origin behind an ingress** | The web client authenticates with an httpOnly cookie. In dev it reaches `:8086` because cookies ignore port; across hosts in production it will not. Path routing behind one origin fixes it without the frontend learning a second auth mode | with commerce Phase 4 |
| **CloudFront in front of the processed bucket** | Today every HLS segment is proxied through the transcoder's Express process. That makes a stateless worker into a bandwidth bottleneck and couples playback availability to transcoding availability — §6.2 | P1 |
| **`course-service` extracted; `backend` becomes `auth-service`** | `backend/` currently owns four unrelated domains. The seam already exists as the internal API | P2 |
| **S3 → SNS → SQS → Kafka bridge wired** | `video.uploaded` is published by the backend's `confirm` call today, so an upload that completes but never confirms is invisible. The object event is the ground truth | P3 |

### 4.2 Why commerce does not wait for the service split

`order-service` has exactly two dependencies on the course domain, and neither
is a database: one HTTP call behind `CatalogueClient`, and one Kafka consumer of
`order.paid`. When `Course`/`Enrollment` move, `order-service` changes by zero
lines and `CATALOGUE_BASE_URL` changes by one. Extracting `course-service` first
would delay commerce by a whole migration to create a seam the design already
assumes. Diagram: `docs/diagrams/08-service-split.eraser`.

---

## 5. Technology: now, and next

### 5.1 In use today

| Concern | Choice | Why this one |
|---|---|---|
| Web UI | Next.js 14 App Router | Server components for the catalogue, client components where state lives; one deployable |
| API | Express + TypeScript | Already there, and the auth surface is the mature part of the codebase |
| ORM | Prisma | Generated, fully typed data access. `db push` rather than `migrate` — a deliberate dev-speed trade that §7 of `DATABASE_DESIGN.md` says when to abandon |
| Transactional services | Spring Boot / Java 21 | `@Transactional`, Flyway, Spring Data and `@Scheduled` are exactly the primitives an outbox, a state machine and a reconciliation sweeper need |
| Events | Kafka (KRaft, single node) | Durable log, replayable, partitioned per user. A down consumer means a waiting event, not a lost one |
| Relational store | Postgres 15 | One instance, schema per service (§`DATABASE_DESIGN.md` §2) |
| Document store | MongoDB 7 | Templates edited without a redeploy; the delivery ledger is append-heavy and schema-loose |
| Cache / ephemeral | Redis 7 | OTP, sessions, idempotency claims, rate limits. **Never** the source of a correctness guarantee |
| Object storage | S3, LocalStack locally | Raw and processed buckets; direct browser PUT via presigned URL keeps large bodies off the API |
| Transcoding | FFmpeg → HLS | Four-rung ladder, 240p/480p/720p/1080p |
| Playback | hls.js, native HLS on Safari | Adaptive bitrate without a player licence |
| Mail | Nodemailer + EJS today, SMTP from Spring next | Migrating to `notification-service` in its Phase 5 |

### 5.2 Coming, and what triggers each

| Technology | Role | Trigger |
|---|---|---|
| **Razorpay**, then **Stripe** | Payment providers behind one `PaymentProvider` interface | Commerce Phase 4, then Phase 5. Stripe is the proof the abstraction holds: if it touches anything outside `provider/stripe/`, config and one enum constant, the seam was wrong |
| **SNS + SQS** | `s3:ObjectCreated` → SNS → SQS → bridge → Kafka, so the ground truth for "a file arrived" is the bucket, not a client call. `backend/services/sqs.service.ts` already unwraps the SNS envelope LocalStack adds; `startSQSConsumer` is written and never invoked | P3 |
| **CloudFront** | Serve HLS segments at the edge, signed URLs or signed cookies | P1 |
| **FCM** | Push, via `firebase-admin` and the `device_tokens` collection already being populated | notification Phase 2 |
| **Twilio or SNS SMS** | Third channel; three steps and no orchestrator change | notification Phase 5 |
| **Flyway** | Migrations for `order-service` — `ddl-auto=validate`. The money tables are the last place to infer a schema at boot | commerce Phase 1 |
| **Testcontainers** | Postgres + Kafka integration tests for the payment chain | commerce Phase 1 |
| **Prometheus + Grafana** | `micrometer-registry-prometheus`; Actuator is already on the classpath | P5 |
| **OpenTelemetry** | One trace id across frontend → service → Kafka → consumer. Today a purchase crossing four processes cannot be followed | P5 |
| **BullMQ** | A dependency imported nowhere, kept deliberately. Only earns its place if a Node service needs delayed or scheduled jobs that Kafka models badly | unscheduled |
| **Kubernetes (EKS) + Jenkins** | `deploy/` holds a Jenkinsfile and manifests that do not yet match reality (§8) | P5 |

### 5.3 Deliberately rejected

| Option | Why not |
|---|---|
| A service mesh | Five services. The operational cost exceeds the problem |
| GraphQL gateway | The clients are one web app with well-known screens. REST plus a typed client layer is less machinery |
| Separate `payment-service` and `order-service` | Two services that would always deploy together and always fail together. One service, two aggregates |
| A repository layer in `backend/` | Prisma's generated client already is the typed data-access layer; hand-wrapping it loses `select`/`include` narrowing. Enforce the seam with lint instead — `backend/SYSTEM_DESIGN.md` §6 |
| A read-model of the catalogue inside `order-service` | Adds a `course.updated` consumer and a staleness bug class to avoid one HTTP call on a path already talking to a payment gateway over the internet |
| Saga with compensation on enrolment failure | There is nothing to compensate. `order.paid` is durable; if the consumer is down the event waits. Enrolment is retry-until-success, not rollback-the-payment |

---

## 6. Scalability

The honest starting point: **this is a single-replica system today.** Nothing
below is load-tested; it is the plan for where each dimension breaks first and
what the fix is. What matters is that the current design does not *prevent* any
of it.

### 6.1 What scales horizontally already, and what does not

| Component | Stateless? | Safe to run N replicas now? |
|---|---|---|
| `frontend` | yes | yes |
| `backend` | yes — JWT verified per request, no in-process session | yes, **once** the Prisma client is a singleton (`backend/SYSTEM_DESIGN.md` Phase 1) |
| `video-transcoder` | yes for HTTP; Kafka consumer group bounded by partition count | yes, up to `video.uploaded` partitions (**3** today) |
| `order-service` | yes — outbox relay uses `FOR UPDATE SKIP LOCKED` | yes, by construction |
| `notification-service` | yes — Redis idempotency claim per `(notificationId, channel, attempt)` | yes |
| Postgres | no | read replicas, then split by schema |
| Kafka | — | add partitions, then brokers |
| Redis | no | single node is fine; nothing correctness-critical lives there |

**The one blocker today** is `backend/`: `new PrismaClient()` appears in seven
production files. Prisma sizes each pool at `num_cpus × 2 + 1`, so one
eight-core process can open ~119 connections against a Postgres whose default
`max_connections` is 100 — and two services holding different clients cannot
share a `$transaction`. That is Phase 1 of the backend design and a prerequisite
for scaling anything else out.

### 6.2 Where it breaks first, in order

**1. HLS segments proxied through the transcoder.** Every segment request is an
S3 `GetObject` streamed through an Express process that is also meant to be
running FFmpeg. One 1080p stream is ~5 Mbit/s; a hundred concurrent viewers is
~500 Mbit/s through a single Node process, and it competes with transcoding for
the same CPU.
*Fix:* CloudFront in front of `s3://processed-videos`, signed URLs or signed
cookies, and the transcoder stops serving bytes. This is the highest-leverage
change in the system and it is **P1**.

**2. Transcoding throughput.** FFmpeg is CPU-bound and the ladder encodes four
renditions per upload. Concurrency is capped at the partition count of
`video.uploaded` — three.
*Fix, in order:* raise partitions and run a replica per partition; then split
the per-resolution `VideoTranscodeJob` rows into independently consumable work
so one long video does not hold a partition; then move the pool to spot/burst
nodes with a KEDA-style scale-on-lag. The `VideoTranscodeJob` table already
models per-resolution work, so the schema does not block this.

**3. Postgres connections and write contention.** Four services against one
instance. Commerce adds the hottest write path.
*Fix:* PgBouncer in transaction mode; `order-service` already carries its own
schema, so promoting it to its own instance is a connection-string change.
Reads for the catalogue go to a replica before anything is sharded.

**4. The catalogue read path.** `GET /courses` on every page view.
*Fix:* Redis-cached course summaries with short TTL and explicit invalidation on
publish. Deliberately *not* done yet — see the rejected read-model row in §5.3;
the trigger is a measured p99, not a hunch.

**5. Notification fan-out.** One campaign to every user is a different shape
from one receipt per purchase.
*Fix:* the retry topic and DLQ already planned (notification Phase 3), plus the
per-`(tenantId, channel)` sliding window in Phase 4 so one tenant's blast cannot
starve another's transactional mail.

### 6.3 Scaling properties the design already has

These are not future work — they are why the above is reachable:

- **Partition by `userId` on every topic.** Per-user ordering without a global
  ordering guarantee, so partitions can grow freely. `order.paid` can never be
  processed after the `order.refunded` that followed it.
- **Every correctness guarantee is a Postgres unique constraint**, never a Redis
  key. A Redis outage degrades rate limiting; it cannot double-charge a card or
  double-grant an enrolment.
- **At-least-once everywhere, absorbed by idempotent consumers.** Enrolment is
  an upsert on `(userId, courseId)`; receipts derive `notificationId` from the
  order id, so a redelivered `order.paid` produces the same notification id and
  the existing Redis claim suppresses the duplicate email.
- **Large bodies never touch the API.** Upload is a direct browser→S3 PUT
  against a presigned URL; playback will be a direct browser→CDN GET.
- **Price, title and instructor are snapshotted onto the order.** Receipts and
  future payouts do not depend on a row that can change or be deleted — and the
  read is removed from the hot path forever.
- **Multi-tenancy carried from day one** (`tenant_id` on every commerce row and
  notification document), so a second tenant is a data change rather than a
  migration.

### 6.4 Capacity targets to design against

Not measurements — the numbers the next round of work should be sized for, so
"scalable" has a definition:

| Dimension | Target |
|---|---|
| Concurrent viewers | 10k, served from CDN; origin sees cache misses only |
| Catalogue reads | 1k req/s, p99 < 150 ms |
| Uploads | 100/hour sustained, 4-rung ladder, p95 ready < 10× realtime |
| Purchases | 50/s burst, zero double-charges, zero double-enrolments |
| Notifications | 10k/hour, p95 delivery < 60 s |

---

## 7. Cross-cutting concerns

### 7.1 Authentication and authorisation

`backend` signs HS256 access tokens with `ACCESS_TOKEN_SECRET`, payload
`{ id, email, role }`. `isAuthenticated` reads the token from, in order: the
httpOnly cookie (web), the `Authorization: Bearer` header, or the request body
(mobile) — so every protected route supports all three without hand-rolling.
Refresh tokens are hashed into `User.extended.session`, and the refresh cookie
is scoped to `/api/v1/users/refresh-token`.

Other services **verify** the same token with the shared secret and must never
**issue** one. That is enforced by convention rather than by the algorithm,
which is the honest weakness of HS256 here; **RS256 + JWKS is the recorded
migration**, triggered when a third service needs to verify tokens.

Service-to-service traffic uses API keys, not user tokens:
`X-Internal-Api-Key` for `/api/v1/internal/*`, `X-Transcoder-Api-Key` for the
transcoder callback. Both are exempt from the per-IP rate limiter, because
service traffic must not be throttled by a browser limit.

### 7.2 Error handling

Node services: `catchAsyncError` → `ErrorHandler` → `ErrorMiddleWare`. A
controller never writes an error response directly.
Spring services: exceptions implement `AbstractException`, rendered by a
`@RestControllerAdvice` `GlobalExceptionHandler`.
Consumers classify failures `TRANSIENT` vs `PERMANENT`, because retrying a
missing template or a malformed address burns the DLQ budget forever.

### 7.3 Idempotency, in one table

| Layer | Key | Guards against |
|---|---|---|
| Order creation | `(tenant_id, user_id, idempotency_key)` unique | double-clicked Buy, client retry |
| Live order per course | partial unique on `(tenant, user, course) WHERE status IN ('CREATED','PENDING')` | two tabs |
| Already owns it | entitlement check against the catalogue owner | no index can see this — the old order is `PAID` |
| Webhook ingest | `(provider, provider_event_id)` unique | provider redelivery, replay |
| Notification | `<orderId>:receipt` as `notificationId` | duplicate receipt email |
| Enrolment | upsert on `(userId, courseId)` | at-least-once `order.paid` |
| Transcode callback | `Video.status` state guard | redelivered `video.uploaded` |

### 7.4 Observability

Today: winston in Node, Actuator in Spring, Kafka UI on `:8080`, Mongo Express
on `:8081`, RedisInsight on `:5540`. **There is no metrics backend and no
distributed tracing**, which means a purchase crossing four processes cannot be
followed end to end. That is the gap P5 closes, and it should land before the
first real payment rather than after.

### 7.5 Security posture

- Webhooks: signature-verified against the **raw** request body, before a single
  row is written. Jackson must not re-serialise it first.
- The charged amount comes from the catalogue, never from the client, and the
  captured amount is re-checked against the order. A mismatch is a hard failure
  and an alert.
- Ownership checked on every read; someone else's order returns `404`, not
  `403`, so existence is not confirmed.
- Secrets in environment variables only, never logged. Persisted webhook
  payloads are scrubbed of card metadata.
- Layered rate limits: 5 req/15 min on login and register, `RATE_LIMIT_MAX`
  (default 1000) per IP per 15 min across `/api/v1`.
- `app.ts` **hard-exits** if `JWT_SECRET`, `ACCESS_TOKEN_SECRET`,
  `REFRESH_TOKEN_SECRET` or `CLIENT_URL` is missing — a service that boots
  without them looks healthy and rejects every request.

---

## 8. Deployment

`deploy/` holds a Jenkins-in-Docker `Dockerfile`, a `Jenkinsfile`, and
`lms-deployment.yaml`. **The manifests do not currently describe this system** —
the backend is declared on `containerPort: 3000`, every deployment is one
replica, and `order-service` is absent. They are a starting point, not a
deployment.

The target, as P5:

| Concern | Decision |
|---|---|
| Ingress | One origin, path-routed, so the cookie keeps working and CORS stays trivial |
| Service ports | Settle the `5000`/`5001` and `7000`/`7070` disagreements in `.env.sample` and the manifests at the same time (§2.2) |
| Config | ConfigMaps for non-secrets, Secrets (or SSM/Secrets Manager) for keys. The AWS/LocalStack flag is the only thing that changes between environments |
| Migrations | `prisma db push` is a dev tool. Production needs `prisma migrate deploy` for `public` and Flyway for `orders` — `DATABASE_DESIGN.md` §7 |
| Health | `/health` exists on the transcoder; the others need liveness and readiness probes, with readiness gated on the datastore |
| Stateful | Managed services in production: RDS, ElastiCache, MSK, DocumentDB or Atlas. The compose file stays the dev story |
| Scaling | HPA on CPU for `frontend`/`backend`; scale-on-consumer-lag for the transcoder and the notification service |

### 8.1 Moving S3 from LocalStack to AWS

Locally, LocalStack community edition holds S3 **in memory**: a container restart drops every
bucket and every uploaded or transcoded video, while `Video` rows still say `READY` — the player
then fails with `manifestLoadError`. `localstack/ready.d/01-buckets.sh` recreates the empty
buckets on each start; the files themselves are gone, so re-upload after a restart. (Persistence
is a paid LocalStack feature — verified it does not survive a restart on 4.14 with
`PERSISTENCE=1`.) None of this applies on AWS.

The code switch is `LOCAL_STACK_DATA_SOURCE=false` in `backend/.env` and
`video-transcoder/.env`. What has to exist before that flag flips:

| Item | What |
|---|---|
| **Bucket names** | Globally unique — `raw-video` / `processed-video` are certainly taken. e.g. `learnsphere-<env>-raw-video`, `learnsphere-<env>-processed-video`; set `S3_RAW_VIDEO_BUCKET` (backend + transcoder) and `S3_PROCESSED_VIDEO_BUCKET` (transcoder). |
| **Provisioned, not created by the app** | The backend creates buckets and sets CORS **only on LocalStack**. On AWS create both buckets up front (console, Terraform, CDK), in the same region as `AWS_REGION` — presigned URLs are signed for that region. |
| **Raw bucket CORS** | The browser PUTs straight to it: allow `PUT`, `GET`, `HEAD` from the frontend's real origin, `AllowedHeaders: *`, expose `ETag`. Without it the upload fails in the browser while the API looks fine. |
| **Block public access** | On for both. Nothing reads a bucket directly: uploads use presigned URLs, playback goes through the transcoder (later CloudFront with Origin Access Control). |
| **Credentials** | In production an **IAM role** (instance profile / ECS task role / EKS IRSA) and **no** access keys in env — both services fall back to the SDK default chain when `AWS_ACCESS_KEY_ID` is unset. Static keys are only for trying AWS from a laptop. |
| **Backend IAM** | `s3:PutObject` on `raw/*` (presigned uploads are signed with the backend's identity, so it needs the permission it hands out); `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` for video delete. |
| **Transcoder IAM** | `s3:GetObject` on `raw/*`; `s3:PutObject` and `s3:GetObject` on `processed/*` (it writes HLS and streams it). |
| **Lifecycle (recommended)** | Expire originals in the raw bucket after N days once transcoded; abort incomplete multipart uploads after 1 day. |
| **SQS/SNS** | Not used at runtime today (`startSQSConsumer` is never invoked), so nothing to provision until P3. |

Smoke test after the switch: upload a video as an instructor → `Video` reaches `READY` → the
lesson plays. The failure modes map one-to-one onto the rows above: a browser CORS error (raw
CORS), `AccessDenied` in a service log (IAM), `NoSuchBucket` (names or region).

---

## 9. Open questions

1. **Backend port: `5000` or `5001`?** The service defaults to one and the
   frontend to the other, which works only because both are usually running.
   Pick one and fix `.env.sample`, the README and the manifests together.
2. **Transcoder port: `7000` or `7070`?** Same shape of problem.
3. **When does `course-service` get extracted — before or after commerce?**
   §4.2 argues after, and the price is ~150 lines of TypeScript that later get
   ported. If the split is imminent, those phases should start there instead.
4. **What stack does `course-service` use?** Spring would make three of five
   services consistent; Node would let `course.service.ts` and
   `videoUpload.controller.ts` move nearly as-is. It needs its own
   `SYSTEM_DESIGN.md` either way, and note that `video-transcoder` writes
   `Video` rows directly today, so it has to repoint — preferably onto a
   callback like the one it already uses.
5. **RS256 + JWKS — when?** The trigger is a third token verifier. Commerce
   makes `order-service` the second.
6. **Is `name` added to the access-token claims?** One line in
   `generateAccessToken`, and every future service gets a personalised greeting
   without a user lookup. It is a token-contract change, so it is your call.
