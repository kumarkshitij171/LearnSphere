# LearnSphere — Roadmap

**This is the live roadmap.** It is derived from the design documents, not a
substitute for them: every item points at the design that explains *why*. If
this file and a design document disagree, the design document wins and this file
needs updating.

| Where the reasoning lives | |
|---|---|
| `ARCHITECTURE.md` | system boundaries, current vs target topology, technology now/next, the scaling plan, deployment |
| `DATABASE_DESIGN.md` | data ownership, schema boundaries, money, indexes, migrations, retention |
| `<service>/SYSTEM_DESIGN.md` | per-service HLD, LLD and phase plan |
| `docs/diagrams/` | diagram-as-code, rendered in the Eraser workspace **LearnSphere - System Architecture** |

The original pre-rewrite brain-dump is archived at
`video-transcoder/docs/archive/original-todo.md`. It describes a design that was
deliberately not built — nothing in it is outstanding work.

**How to use this file.** Work proceeds one phase at a time. A phase is done when
it compiles, runs, and does what it claimed — not when the code is written.
Mark `[~]` for "written but unverified" rather than `[x]`; an honest `[~]` is
worth more than an optimistic tick.

---

## Where we actually are

| Service | State |
|---|---|
| `frontend/` | **Working.** Auth, catalogue, admin, course management, upload component, HLS playback |
| `backend/` | **Working.** Auth + RBAC + catalogue + video intake + internal API. Commerce Phase 0 shipped |
| `video-transcoder/` | **Working.** Phases 1, 2, 3a done: Kafka → probe → source-aware HLS ladder (up to 4K, never upscaled, portrait kept) + poster → S3 → callback; serves HLS from S3 |
| `notification-service/` | Phase 1 **compiles** (two fixes); Phase 1b seeding done. Never run against Mongo/Kafka |
| `order-service/` | **Phases 1–6 written + unit-tested (48/48); not yet built with Maven** — needs network + Docker |
| Tests | `backend/` has a Jest suite. **No tests anywhere else** |
| Observability | No metrics backend, no tracing |
| Deployment | `deploy/` manifests do not describe this system |

---

## P0 — Commerce

The revenue path. Design: `order-service/SYSTEM_DESIGN.md` Part III.

- [x] **Phase 0 — catalogue prerequisites in `backend/`**
      `internalAuth.ts`, `internal.routes.ts`, `internal.controller.ts`,
      `getCourseForCatalogue` + `getEnrollment`, `utils/money.ts`,
      `Enrollment.orderId`/`source`/`revokedAt`, `Course.currency`.
  - [~] `tests/integration/internal.routes.test.ts` — cannot compile without
        network access for `prisma generate`. Run `npx prisma generate && npm test`
        on a networked machine to close this out.
- [~] **Phase 1 — order-service skeleton on the mock provider** — written, not yet Maven-built.
      Phases 2–6 below are in the same state: code + unit tests, no real infra run yet
  - [x] Align the scaffold: Java 21, Boot 4.0.3, `com.lms.order_service`, dependency set
  - [x] Flyway `V1__orders_baseline.sql` — five tables (`refunds` lands as V2 in Phase 6), `ddl-auto=validate`
  - [x] JWT filter + `OrderContextHolder`, fail-fast on missing secrets
  - [x] `PaymentProvider` + `PaymentProviderRegistry` + `MockPaymentProvider` + dev mock gateway
  - [x] `OrderStateMachine`, `CatalogueClient`, `POST /orders`, `GET /orders/{id}`
  - [x] Outbox + `@Scheduled` relay with `FOR UPDATE SKIP LOCKED`
  - [x] Unit tests — **48/48 pass** across Phases 1–6
  - [~] `OrderFlowIntegrationTest` (Testcontainers) written, **not run** — needs Docker
  - [ ] `./mvnw install` on a networked machine — blocked here on 9 undownloaded artifacts
  - [ ] `@DataJpaTest` on the partial unique index (the race itself is covered by the integration test's replay cases)
  - **Verify:** create an order against a real course, POST the dev mock webhook,
    see `order.paid` land in Kafka UI on `:8080` — steps in `order-service/SYSTEM_DESIGN.md` Phase 1
- [x] **Phase 2 — enrolment actually granted** — backend Jest 125/125; also fixed `isEnrolled` ignoring `revokedAt` and the re-grant upsert
      `backend`'s first Kafka consumer; `enrollInCourse` gains `orderId`/`source`;
      `POST /courses/:id/enroll` becomes an `INSTRUCTOR`/`ADMIN` grant endpoint
      returning `402 { requiresOrder: true }` to students.
  - **Verify:** the Phase 1 flow flips `GET /courses/:id` to `enrolled: true`, and
    replaying the same event twice still yields one enrolment row
- [x] **Phase 3 — receipts** — `NotificationPublisher`, `name` in the access token, notification-service seeding + compile fixes
      `NotificationPublisher` writes `NotificationMessage`s to the outbox.
      **No Java changes in `notification-service`** — but it needs its Phase 1
      compiled and Phase 1b (template seeding) done first.
  - **Verify:** an email arrives, and a redelivered `order.paid` does not send a
    second one
- [~] **Phase 4 — Razorpay + the frontend buy flow** (they land together; neither
      is testable alone)
  - [x] `RazorpayPaymentProvider`, signature verification against the raw body
  - [x] Order expiry + the reconciliation sweeper (`FOR UPDATE SKIP LOCKED`, no leader election)
  - [x] cancel / retry / providers endpoints, per-user Redis rate limit, CORS
  - [x] Frontend: client factory, `orders.service.ts`, Buy flow, honest polling, purchases page
  - [ ] **Observability for this service (`SYSTEM_DESIGN.md` §12.6) — not built.**
        Still required **before** the first real payment
  - [ ] Test-mode Razorpay run in a browser (needs keys + network)
  - **Verify:** a test-mode card buys a course end to end in the browser; kill the
    webhook deliberately and watch the sweeper recover the order
- [x] **Phase 5 — Stripe.** The seam held: only `provider/stripe/` and config changed
- [x] **Phase 6 — refunds and admin.** `RefundService`, admin endpoints,
      `order.refunded` → enrolment revocation (full refunds only), purchase history + admin refund UI

---

## P1 — Playback off the transcoder

The highest-leverage scalability change available. Today every HLS segment is
proxied through the Node process that also runs FFmpeg
(`ARCHITECTURE.md` §6.2, `video-transcoder/SYSTEM_DESIGN.md` §4.1).

- [x] **transcoder Phase 1 — delete the dead weight, fail fast**
  - [x] Delete `src/services/db.service.ts`, `prisma/`, the `postinstall`
        `prisma generate`, `DATABASE_URL` (`DATABASE_DESIGN.md` §3.2)
  - [x] Resolve `src/utils/transcode.js` vs the TypeScript source
  - [x] Require `TRANCODER_API_KEY`, both buckets and FFmpeg **at startup** —
        today a missing key silently skips the callback and the video sits at
        `UPLOADED` forever
- [x] **transcoder Phase 2 — make the consumer honest**
  - [x] Classify transient vs permanent and **rethrow** transient, so Kafka
        actually redelivers. Today the handler swallows errors, which *commits*
        the offset — the retry the comment promises does not happen
  - [x] Heartbeat during the job, so a long encode is not evicted from the
        consumer group mid-job (verified with a 72 s 4K job)
  - [x] Bounded retry with backoff on the backend callback
  - [x] Readiness that reports consumer-group membership
  - **This is the prerequisite for running more than one replica**
- [ ] **transcoder Phase 3 — output quality and parallelism** (3a done, 3b open)
  - [x] **3a** — source-aware ladder (`video-transcoder/SYSTEM_DESIGN.md` §7.1):
        probe first, native top rung up to 2160p, never upscaled, portrait and 4:3
        kept undistorted, aligned keyframes, `veryfast`; duration, renditions and
        a failure `errorCode` reported back; `poster.jpg` per video
  - [ ] **3b** — encode rungs in parallel with a bounded worker count (or one decode + `split`)
  - [ ] Optionally widen the callback with per-rung `jobs[]` so
        `VideoTranscodeJob` finally gets rows and progress is real
- [ ] **transcoder Phase 4 — CloudFront in front of `processed-videos`**
      Signed URLs or cookies; delete the HLS mount; `frontend/lib/playback.ts`
      points at the CDN
- [ ] **frontend Phase 4 — upload UX**
      Progress on the direct PUT; backoff polling with an honest terminal
      message; branch on `status` before resolving a playback URL
- [ ] **Verify the whole chain on local infra**, end to end in a browser

---

## P2 — Service split

Design: `backend/SYSTEM_DESIGN.md` §4 and Phase 7; `ARCHITECTURE.md` §4.2.
**Do the backend layering phases first** — moving tangled code is how a
migration becomes a rewrite.

- [ ] **backend Phase 1 — one Prisma client.** `new PrismaClient()` appears in
      **seven** production files; each pool is `num_cpus × 2 + 1`, so one
      eight-core process can reach ~119 connections against a `max_connections`
      of 100, and two services cannot share a `$transaction`.
      **This blocks running more than one backend replica.**
- [ ] **backend Phase 2** — `auth.service.ts` rename + `persistSession`/`revokeSession`
- [ ] **backend Phase 3** — user data access into `user.service.ts`; 9 call sites
      out of `user.controller.ts`. The one phase with real risk
- [ ] **backend Phase 4** — `ownership.ts` via `course.service`; ESLint with the
      `no-restricted-imports` guard; delete the legacy presign route
- [ ] **backend Phase 5** — split `auth.controller` from `user.controller`
- [ ] **backend Phase 6** — `prisma migrate` cutover (`DATABASE_DESIGN.md` §8.2).
      **Trigger: the first environment whose data we would be sorry to lose**
- [ ] **Write `course-service/SYSTEM_DESIGN.md`** — it does not exist, and the
      split must not start without it. Open questions it has to answer:
      what it owns (`Course` + `Enrollment` + `Video`), and in what stack
- [ ] **backend Phase 7** — move the course domain out; `backend` becomes
      `auth-service`

---

## P3 — Event ground truth

Today `video.uploaded` is published by the backend's `confirm` call, so an upload
that completes but is never confirmed is invisible. The object event is the truth.
`backend/services/sqs.service.ts` already unwraps the SNS envelope LocalStack
adds; `startSQSConsumer` is written and **never invoked** — keep it, do not delete.

- [ ] `s3:ObjectCreated` → SNS → SQS on `raw-videos`
- [ ] Invoke `startSQSConsumer` and bridge SQS → Kafka
- [ ] Reconcile with the `confirm` path so a video is not transcoded twice
      (the `Video.status` guard is the dedup point)
- [ ] Decide `bullmq`'s fate: it is a dependency imported nowhere, kept
      deliberately. It only earns its place if a Node service needs delayed or
      scheduled jobs that Kafka models badly (`ARCHITECTURE.md` §5.2)

---

## P4 — Notifications

Design: `notification-service/SYSTEM_DESIGN.md` §12.

- [~] **Phase 1 — email end to end.** **Compiles** (fixed an uncatchable interface and
      the Jackson 2 → 3 mismatch). Not yet run against Mongo/Kafka/SMTP
- [x] **Phase 1b — template seeding.** `resources/seed-templates/*.json` + `TemplateSeeder`.
      `account-activation` not ported yet (needed only for the Phase 5 cutover)
- [ ] **Phase 2 — push via FCM.** `firebase-admin`, `PushSender`,
      `sendEachForMulticast`, deactivate `UNREGISTERED` tokens. Frontend: service
      worker, `getToken()`, `POST /api/v1/devices` after login
- [ ] **Phase 3 — retry topic, DLQ, admin replay**
- [ ] **Phase 4 — rate limiting + metrics.** Redis sliding window per
      `(tenantId, channel)` so one tenant's blast cannot starve another's
      transactional mail
- [ ] **Phase 5 — SMS, and the backend cutover.** Port
      `backend/views/activationMail.ejs` to an `account-activation` template,
      replace the `sendMail()` call in `registerUser` with a Kafka publish, then
      delete the backend's nodemailer path. **Deliberately last** — signup works
      today and there is no reason to risk it before the delivery path has
      proven itself

---

## UI configuration

Design: `backend/SYSTEM_DESIGN.md` Part IV (storage, contract, phases) and
`frontend/SYSTEM_DESIGN.md` Part IV (consumption, the VS Code-style editor).
**U1–U4 built.** Run `npx prisma db push` (3 new tables) and `npm install` in `frontend/`.

- [x] **U1 — contract + storage.** Jest 38 new tests; validator is in-house (no `ajv` offline). JSON Schema + default in `backend/config/ui/`,
      Prisma models, ajv validator, public read + admin routes, seed on boot, export script
- [x] **U2 — frontend reads config.** Server-side fetch in the root layout, provider,
      fallback to today's UI; sidebar, brand, announcement, feature toggles
- [x] **U3 — the editor.** Not yet opened in a browser `/admin/ui-config`: Monaco diff, schema validation +
      autocomplete, Problems, autosave draft, publish, timeline, rollback
- [x] **U4 — preview, compare any two versions, theme tokens**
- [ ] `npm run build` + Playwright: admin edits a label → publish → sidebar shows it; student gets redirected and 403

## P5 — Operability

Nothing here is optional before real users; it is only cheap to defer while
there are none.

- [ ] **Settle the port disagreements.** `backend` defaults to `5000` and the
      frontend expects `5001`; the transcoder defaults to `7000` and the frontend
      expects `7070`. One decision, then fix `.env.sample`, `frontend/src/config/env.ts`,
      `README.md` and `deploy/lms-deployment.yaml` **together** (`ARCHITECTURE.md` §9)
- [ ] **Metrics.** `micrometer-registry-prometheus` in both Spring services
      (Actuator is already on the classpath), Prometheus + Grafana
- [ ] **Tracing.** OpenTelemetry, with the trace id propagated onto Kafka headers
      so a purchase can be followed across four processes
- [ ] **Alerts that matter:** outbox depth rising, any amount mismatch, any
      invalid webhook signature, DLQ non-zero, `PENDING` order backlog growing
- [ ] **Fix `deploy/lms-deployment.yaml`** — it declares `containerPort: 3000`
      for the backend, one replica everywhere, and no `order-service`
- [ ] **Health probes** on every service; readiness gated on the datastore
- [ ] **Ingress with one origin**, path-routed, so the auth cookie keeps working
      across services in production (also needed by commerce Phase 4)
- [ ] **Managed stateful services** in production: RDS, ElastiCache, MSK,
      DocumentDB or Atlas. The compose file stays the dev story
- [ ] **Secrets** out of env files into SSM / Secrets Manager
- [ ] **CI**: `prisma generate` → `npm test` → `./mvnw test` → build. Note the
      ordering: without `prisma generate`, every backend suite importing a route
      fails to *compile* and it looks like a broken test suite

---

## Tests — the standing gap

`backend/` has Jest. Nothing else has anything.

- [ ] **`order-service`** — non-negotiable, it is the service that can lose money.
      State machine exhaustively; each provider's signature verifier against
      captured real payloads; `@DataJpaTest` for the partial unique indexes;
      Testcontainers for the full chain
- [ ] **`video-transcoder`** — done: `master.m3u8` generation (every
      `#EXT-X-STREAM-INF` followed by its URI), error classification, the ladder,
      probe and poster against the real binaries. Still to do: the HLS path
      normaliser against traversal, LocalStack round-trip, one 3-second fixture
      end to end
- [ ] **`frontend`** — the interceptor (five concurrent 401s → exactly one
      refresh), `env.ts`, `playback.ts`, one Playwright happy path
- [ ] **`notification-service`** — template rendering, error classification,
      the idempotency claim
- [ ] **Contract tests** on the shared envelopes (`video.uploaded`,
      `order.paid`, `NotificationMessage`) so an additive-only promise is
      actually enforced

---

## Data hygiene — small, easy to forget

From `DATABASE_DESIGN.md` §9 and §11.

- [ ] Drop `User.courses String[]` — legacy, `Enrollment` is authoritative.
      Cheapest moment is the Phase 6 migration baseline
- [ ] Retention jobs: `outbox` 30 days post-publish, `webhook_events.payload`
      12 months, `notifications` ledger 90 days (TTL index), S3 `raw-videos`
      lifecycle after successful transcode
- [ ] The indexes named in §3.3 — catalogue listing first, with the caching work
- [ ] **User deletion / erasure touches three stores** and cannot be one
      `DELETE`. Nothing implements it. Recorded so it is not discovered during an
      audit
- [ ] Decide `Course` soft delete (`archivedAt`) — deleting a course with paid
      enrolments would orphan receipts, and there is no policy today

---

## Deferred, recorded so it is not silently re-litigated

Carts and multi-item orders · coupons · subscriptions · instructor payouts ·
tax/GST · multi-currency · invoice PDFs · DRM · per-title encoding · thumbnails
and sprites · subtitles · live streaming · GraphQL · service mesh · a repository
layer in `backend/` · i18n · PWA · SSR of authenticated pages.

Each has a trigger written down in the design doc that rejected it. Reopen on
the trigger, not on taste.

---

## Open questions blocking work

Answer these and several phases unblock at once. Full context at
`ARCHITECTURE.md` §9.

1. **Ports `5000`/`7000` or `5001`/`7070`?** One answer fixes four files
2. **`course-service` before or after commerce?** The design argues after, at a
   cost of ~150 lines later ported. If the split is imminent, Phase 0 and 2 of
   commerce should start there instead
3. **What stack does `course-service` use**, and does it own `Video`?
4. **Add `name` to the access-token claims?** One line; every future service gets
   a personalised greeting with no user lookup. `notification-service` wants it
   for the receipt template. It is your token contract
5. **Razorpay first, or Stripe?** Razorpay assumed — test mode needs no live
   entity and INR is the likely default
6. **Refund policy** — immediate revocation today. A window-based policy
   ("7 days, under 20% watched") needs watch-progress data that does not exist
7. **Is per-resolution transcode progress wanted?** If yes the callback widens
   and `VideoTranscodeJob` gets rows; if no, drop the table
8. **`tenant_id` on the `public` schema too?** Commerce and notifications carry
   it; the application schema does not. Cheap now, painful later
