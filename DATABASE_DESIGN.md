# LearnSphere — Database Design

Status: **current state verified** against `backend/prisma/schema.prisma` (the
only Prisma schema in the repo), `docker-compose.yml` and the
notification-service entities. **Target state and migration plan are design for
review.**

This document owns the cross-service data questions: who may write what, where
each store's boundary is, how schema changes ship, and what is kept for how
long. Each service's own tables are described here only to the depth the
boundary needs — the detail lives in that service's `SYSTEM_DESIGN.md`.

Diagram: `docs/diagrams/07-data-model.eraser`, rendered as **LearnSphere Data
Model** in the Eraser workspace.

---

## 1. The rule everything else follows from

> **One writer per table. Always.**
> A second service that needs the data gets an API call or an event — never a
> connection string.

Two services writing one table means the table's invariants live in neither of
them, a schema edit in one silently breaks the other, and "who wrote this row
and why" stops having an answer.

**The rule holds everywhere.** It used to hold only by accident in one place:
`video-transcoder` carried a second Prisma schema and an unused `db.service.ts`
that would have written `Video` directly. Both are deleted; the transcoder now
reports only through the backend callback (§3.2).

---

## 2. Ownership map

| Store | Owner | Written by | Read by others via |
|---|---|---|---|
| Postgres schema `public` | `backend/` | `backend/` **only** (see §3.2) | `GET /api/v1/internal/*` |
| Postgres schema `orders` | `order-service` | `order-service` only | `GET /api/v1/orders/*`, `order.*` events |
| MongoDB `notifications` db | `notification-service` | `notification-service` only | `GET /api/v1/notifications/*` |
| Redis | shared, namespaced by prefix | each service, own prefix (§6) | never — ephemeral by definition |
| S3 `raw-videos` | `backend` writes (presigned PUT by the browser), `video-transcoder` reads | — | presigned URLs |
| S3 `processed-videos` | `video-transcoder` writes | — | HLS GET (CDN, target) |

**Three stores, three owners, chosen for shape rather than fashion:**

| Store | Why this data belongs here |
|---|---|
| **Postgres** | Users, courses, enrolments, orders and payments all have invariants worth a constraint: "one enrolment per user per course", "one live order per course", "a refund cannot exceed its payment". Those are unique indexes and foreign keys, and nothing else enforces them as cheaply |
| **MongoDB** | Templates are content edited without a redeploy, and the delivery ledger is append-heavy, schema-loose and queried by a handful of keys. Neither needs a join |
| **Redis** | OTPs, idempotency claims and rate-limit windows all have a TTL and none is a source of truth. **No correctness guarantee in this system depends on Redis** — a Redis outage degrades rate limiting, it cannot double-charge a card |

---

## 3. Postgres

One Postgres 15 instance, `testDB`, `testUser` / `mysecretpassword`, published
on host port **5434** (container 5432).

### 3.1 Schema layout

```
  testDB
  ├── public    backend/        User, Course, Enrollment, InstructorRequest,
  │                             Video, VideoTranscodeJob        (Prisma)
  ├── orders    order-service/  orders, payments, refunds,
  │                             order_events, webhook_events, outbox   (Flyway)
  └── course    course-service/ Course, Enrollment, Video — after the split (P2)
```

Schema-per-service in one instance is a real boundary without a second
container. Prisma's `db push` only manages `public`, so it can never touch the
money tables; Flyway's `schemas=orders` is similarly fenced. Promoting any
schema to its own instance later is a connection-string change, which is the
whole point.

`order-service` connects with `?currentSchema=orders` and
`spring.jpa.hibernate.ddl-auto=validate`. **The money tables are the last place
in the system to want a schema inferred at boot.**

### 3.2 The duplicated Prisma schema — removed

`video-transcoder` used to carry a second `prisma/schema.prisma` pointed at the
same database, there only to serve `src/services/db.service.ts` — a client that
nothing imported and whose status values (`'PROCESSING' | 'COMPLETED'`) were not
valid `VideoStatus` members, so it would have failed at its first write.

**Option A shipped** (video-transcoder Phase 1): `db.service.ts`,
`video-transcoder/prisma/`, its `postinstall` `prisma generate` and its
`DATABASE_URL` are gone. **Only `backend/` has a Prisma schema now**, and the
"edit both schema files" rule no longer exists.

The transcoder holds no database client at all. Its one path to the data is
`POST /api/v1/video-upload/:videoId/processed`, and the backend does the write:
`status` and `hlsMasterPath`; with `READY`, the source `duration` (whole seconds →
`Video.duration`) and the rendition list (`[{ label, width, height, bandwidth }]`
→ `Video.resolutions`); with `FAILED`, `{ error, errorCode }` → `Video.metadata`.

The gap that remains is per-resolution progress: `VideoTranscodeJob` rows are
still written by nobody, so `QUEUED → PROCESSING → COMPLETED` is modelled and
unused. If that detail is wanted, **widen the callback to carry it** —
`video-transcoder/SYSTEM_DESIGN.md` §9.2 — rather than reviving a second writer.

### 3.3 `public` — the application schema

Verified against `backend/prisma/schema.prisma`. IDs are `cuid()` except `Video`
and `VideoTranscodeJob`, which are `uuid()`.

**`User`** — `id`, `email` (unique), `name`, `role` (`Role`), `isVerified`,
`password` (bcrypt), `courses String[]`, `avatar?`, `extended Json?`,
timestamps.

- `courses String[]` is **legacy**; `Enrollment` is the source of truth. It is
  dead weight that reads like live data — §9 asks when it goes.
- `extended Json?` holds `session`: the hashed refresh token plus device
  context. Keeping it off a column means session shape changes do not migrate,
  at the cost of not being queryable. Acceptable because nothing queries it.
- `password` is bcrypt with a `BCRYPT_PEPPER`. Never selected into a response —
  controllers strip `{ password, extended, ...safeUser }`.

**`Course`** — `id`, `title`, `description`, `price Float`, `currency` (default
`INR`), `thumbnail?`, `isPublished`, `instructorId → User`, timestamps.

- **`price` is a `Float`, which is the wrong type for money**, and it is staying
  that way on purpose. Switching to `Decimal(10,2)` changes what the API emits
  from a JSON number to a JSON string and breaks `CourseSummary.price: number`
  in the frontend — so it is a frontend-coordinated change, not a backend one.
  The actual requirement is *no service re-derives money from a float*, and that
  is met at the boundary: `backend/utils/money.ts` converts once and the wire
  carries `amountMinor` (an integer in paise). §5 has the full argument.

**`Enrollment`** — `id`, `userId → User`, `courseId → Course`, `orderId?`
(unique), `source EnrollmentSource` (default `FREE`), `enrolledAt`, `revokedAt?`,
with `@@unique([userId, courseId])`.

- The unique pair is what makes `order.paid` safe to deliver at-least-once: the
  consumer upserts.
- `source` defaults to `FREE`, not `PURCHASE`, because the default only ever
  applies to rows nobody set explicitly — which today means every enrolment that
  already exists, all created by the free enrol endpoint. Defaulting to
  `PURCHASE` would have relabelled that history as bought.
- **Refunds set `revokedAt`; they never delete.** A revoked row reads as *not*
  enrolled, so a refunded buyer can purchase again, but the history survives and
  support can explain what happened.

**`InstructorRequest`** — `id`, `userId → User`, `status`, `message?`,
`reviewedBy?`, `reviewedAt?`, timestamps, `@@index([status])`. The index is
there because the only query is the admin queue filtered by `PENDING`.

**`Video`** — `id uuid`, `userId → User`, `courseId? → Course`, `originalKey`,
`title`, `description?`, `duration?`, `fileName?`, `fileSize?`, `mimeType`,
`status VideoStatus`, `hlsMasterPath?`, `resolutions Json?`, `metadata Json?`,
timestamps.

- `originalKey` and `hlsMasterPath` are **S3 keys, not URLs** — no bucket, no
  host. That is what lets a CDN be put in front later without rewriting rows
  (§7.3 of `ARCHITECTURE.md`).
- `courseId` is nullable so a video can exist before it is attached. Playback
  authorisation goes through the course, so an unattached video is unreachable.

**`VideoTranscodeJob`** — `id uuid`, `videoId → Video`, `resolution`, `status
JobStatus`, `inputKey`, `outputKey?`, `error?`, `progress`, timestamps. One row
per rung of the ladder, which is what makes per-resolution parallelism possible
later without a migration (§6.2 of `ARCHITECTURE.md`).

**Enums** — `Role` (`STUDENT|INSTRUCTOR|ADMIN`), `InstructorRequestStatus`,
`EnrollmentSource` (`PURCHASE|FREE|ADMIN_GRANT|INSTRUCTOR`), `VideoStatus`
(`UPLOADED→TRANSCODING→READY|FAILED`), `JobStatus`
(`QUEUED→PROCESSING→COMPLETED|FAILED`).

#### Indexes that are missing and will be wanted

Declared today: PKs, `User.email` unique, `Enrollment(userId, courseId)` unique,
`Enrollment.orderId` unique, `InstructorRequest.status`. Prisma implicitly
indexes foreign keys.

| Index | Query it serves |
|---|---|
| `Course(isPublished, createdAt DESC)` | the public catalogue listing — the single hottest read |
| `Course(instructorId, createdAt DESC)` | "my courses" |
| `Enrollment(userId, revokedAt)` | "my enrolments", excluding revoked |
| `Video(courseId, status)` | the course player page, `READY` videos only |
| `Video(status)` partial on `UPLOADED`/`TRANSCODING` | finding stuck transcodes |

None is urgent at current data volumes; all are cheap and should land with the
catalogue caching work rather than being guessed at now.

**UI configuration (`backend/SYSTEM_DESIGN.md` Part IV).**
`UiConfigVersion` (append-only; the audit log of every published UI config),
`UiConfigState` (one row: the live version number) and `UiConfigDraft` (one per
admin). Written by `backend/` only. The schema and seed for the document live in
git at `backend/config/ui/`; the live values live here.

### 3.4 `orders` — the commerce schema

Owned by `order-service`, Flyway-managed, never touched by Prisma. Six tables;
full column lists in `order-service/SYSTEM_DESIGN.md` §11.

| Table | Role | The constraint that matters |
|---|---|---|
| `orders` | the commercial fact | `UNIQUE (tenant_id, user_id, idempotency_key)` and a **partial** `UNIQUE (tenant_id, user_id, course_id) WHERE status IN ('CREATED','PENDING')` |
| `payments` | attempts against an order — a declined card then a UPI retry | `UNIQUE (provider, provider_payment_id)` |
| `refunds` | full and partial | `provider_refund_id` unique |
| `order_events` | append-only transition log: `from`, `to`, `reason`, `actor` | never updated, never deleted |
| `webhook_events` | dedup and audit, with the raw payload | `UNIQUE (provider, provider_event_id)` — the replay guard |
| `outbox` | events written in the same transaction as the state change | partial index `WHERE published_at IS NULL` |

Three of these exist for reasons worth stating plainly:

- **The partial unique index** is what makes double-clicking Buy safe even when
  a client forgets its idempotency key — and `EXPIRED`/`CANCELLED` are excluded
  so abandoning a checkout frees the user to start again.
- **`webhook_events` keeps the raw payload** so a support question about a
  payment from three months ago has an answer that does not involve logging into
  a gateway dashboard.
- **`outbox` exists because a Postgres commit and a Kafka publish cannot be
  atomic.** Writing the event as a row in the same transaction and relaying it
  after makes "the order is PAID but nobody was told" impossible. The cost is
  at-least-once delivery, which every consumer already absorbs.

### 3.5 Snapshotting, and why it is not denormalisation gone wrong

`orders` copies `course_title`, `instructor_id`, `amount_minor`, `currency` and
`user_email` at creation time. This is not a cache — **it is a record of a
moment.** An instructor editing the price next week must not rewrite the history
of a completed sale, and a receipt must not break because a course row was
deleted. It also removes the catalogue from the receipt path entirely.

---

## 4. MongoDB

One database, owned by `notification-service`. Mongo 7, `mongo`/`mongo123`,
port 27017.

| Collection | Key | Notes |
|---|---|---|
| `templates` | unique `(tenantId, name, channel)` | one template per channel — email HTML and a push title/body are different documents. `version` bumps on edit; `active=false` retires without deleting |
| `notifications` | unique `(notificationId, channel)` | the delivery ledger. **One row per channel**, because "the email sent but the push failed" is a real outcome a single status field cannot express |
| `device_tokens` | `token` unique | FCM registrations. Collected from Phase 1 though `PushSender` arrives in Phase 2, so push turns on with an audience already present. A token FCM reports `UNREGISTERED` gets `active=false` rather than deleted |

**Every query is scoped by `tenantId`. No exceptions.** The service was
scaffolded multi-tenant and keeping that discipline now is far cheaper than
retrofitting it.

**Nothing seeds this today**, which is a real operational hole: a fresh
`docker compose up` leaves `templates` empty and every notification fails
`PERMANENT` with "template missing". The fix is a `resources/templates/*.json`
set plus a dev-profile `ApplicationRunner` that upserts on boot —
`notification-service/SYSTEM_DESIGN.md` §9.2.

---

## 5. Money

One rule, stated once: **money is an integer count of minor units plus an ISO
4217 code. Never a float, never a bare number without its currency.**

| Where | Representation |
|---|---|
| `Course.price` | `Float` — **legacy**, tolerated only because it is never re-derived from (§3.3) |
| `Course.currency` | `String`, default `INR` |
| The wire, between services | `amountMinor` (integer paise/cents) + `currency` |
| `orders.amount_minor`, `payments.amount_minor`, `refunds.amount_minor` | `bigint` |
| Display | formatted at the edge only |

The conversion happens exactly once, in `backend/utils/money.ts`, and it
**shifts the decimal exponent (`Number("1.005e2")`) rather than multiplying** —
because `1.005 * 100` is `100.49999999999999` in IEEE-754 and silently rounds a
half-paisa down. That is the kind of bug that is invisible until an accountant
finds it.

---

## 6. Redis keyspace

Shared instance, namespaced by prefix, password `local` locally.

| Prefix | Owner | TTL | Purpose |
|---|---|---|---|
| OTP / activation | `backend` | minutes | email verification codes |
| session | `backend` | token lifetime | refresh-token support |
| `notif:idem:{tenantId}:{notificationId}:{channel}:{attempt}` | `notification-service` | 24h | `SETNX` claim. Including the attempt means a *redelivery* is suppressed while a genuine *retry* still goes through |
| rate limit | `order-service`, `notification-service` | window | per-user order creation; per-`(tenant, channel)` send windows |
| sweeper leader election | `order-service` | short | so N replicas run one reconciliation sweep |

**Idempotency fails open.** If Redis is unavailable the notification send
proceeds: a duplicate email is a better outcome than a missing one. This is safe
precisely because Redis is not where correctness lives (§2).

---

## 7. S3 layout

| Bucket | Key | Written by |
|---|---|---|
| `raw-videos` | `{videoId}/original.mp4` | the browser, via presigned PUT |
| `processed-videos` | `{videoId}/master.m3u8` | `video-transcoder` |
| `processed-videos` | `{videoId}/{resolution}/playlist.m3u8` + `*.ts` | `video-transcoder` |

`{videoId}` as the prefix means one object-store delete removes everything for a
video, and relative URIs inside the playlists resolve under the same base —
which is exactly what lets a CDN be mounted at that prefix without rewriting a
single playlist.

**Database rows store keys, never URLs.** Where the bytes are served from is a
deployment decision, and it is about to change (CloudFront, P1).

---

## 8. Migrations

### 8.1 Today

| Store | Mechanism | Honest assessment |
|---|---|---|
| Postgres `public` | `prisma migrate` since 28 Oct 2026 (baseline `0_init`) | Migration history in git, `migrate deploy` in CI/production. The pre-baseline 2024 migration is kept in `prisma/migrations-archive/` for reference only |
| Postgres `orders` | Flyway (planned) | Correct from the start |
| MongoDB | none | Schemaless by choice; `templates.version` carries content versioning |

### 8.2 Target

**Adopt `prisma migrate` for `public` before the first production deploy, not
after.** The cutover:

1. `prisma migrate dev --name init` against a clean database to capture the
   current schema as a baseline migration.
2. `prisma migrate resolve --applied init` on any existing database, so the
   baseline is marked applied rather than re-run.
3. `prisma migrate deploy` in CI from then on; `db push` stays allowed only
   against a local throwaway database.

The trigger is explicit so it is not debated later: **the first environment
whose data we would be sorry to lose.**

Additive-first discipline for both stores — add a nullable column, backfill,
then enforce — so a rollback never needs a down migration. Enum values are
add-only; removing one breaks every row that holds it.

### 8.3 The ordering constraint nobody should rediscover

`npx prisma generate` **must run before `npm test`** in `backend/`. Without it
`@prisma/client` ships stub types and every suite that imports a route fails to
*compile* — which looks exactly like a broken test suite and is not one.

---

## 9. Retention, audit and PII

| Data | Keep | Why |
|---|---|---|
| `orders`, `payments`, `refunds`, `order_events` | **indefinitely** | financial record; `order_events` answers "why is this order in this state" at 2am |
| `webhook_events.payload` | 12 months, then drop the payload and keep the row | the audit trail is the id and the outcome; the raw body is the expensive part |
| `outbox` | 30 days after `published_at` | so "was the event actually emitted" stays answerable, without unbounded growth |
| `notifications` ledger | 90 days | delivery debugging has a short useful life |
| `device_tokens` | until `active=false` + 30 days | |
| `Enrollment` with `revokedAt` | **indefinitely** | purchase history must survive a refund |
| Raw uploads in S3 | until transcode succeeds + 30 days, then lifecycle to Glacier or delete | the HLS output is the product; the master is insurance |

**PII inventory** — `User.email`, `User.name`, `User.avatar`, `orders.user_email`,
`notifications.target`, `device_tokens.token`. Deleting a user therefore touches
three stores and cannot be a single `DELETE`. Nothing implements that today;
**it is unscheduled and recorded here so it is not discovered during an audit.**

`orders.user_email` is duplicated PII, held deliberately so receipts need no
user lookup. It is the one row an erasure request must not silently miss.

---

## 10. Scaling the data layer

Ordered by what gives way first. The full system picture is
`ARCHITECTURE.md` §6.

1. **Connection exhaustion — the live blocker.** Seven `new PrismaClient()` in
   `backend/` production code, each sizing a pool at `num_cpus × 2 + 1`. One
   eight-core process can reach ~119 connections against a default
   `max_connections` of 100, and two services holding different clients cannot
   share a `$transaction`. Fix: one client per process (`backend/SYSTEM_DESIGN.md`
   Phase 1), then PgBouncer in transaction mode.
2. **Catalogue reads.** `Course(isPublished, createdAt DESC)` first, a read
   replica second, Redis-cached summaries third — in that order, each triggered
   by a measured p99 rather than a hunch.
3. **Commerce writes.** `order-service` already holds its own schema, so moving
   it to its own instance is a connection string. The outbox relay uses
   `FOR UPDATE SKIP LOCKED`, so N replicas are safe by construction.
4. **The `notifications` ledger.** Append-heavy and the first collection to need
   a TTL index (§9) plus sharding on `tenantId` if a second tenant arrives at
   volume.
5. **Object storage.** Effectively unbounded; the cost lever is lifecycle rules
   on `raw-videos`, not capacity.

Two properties already in place make all of this reachable: **every correctness
guarantee is a Postgres unique constraint** (so replicas and caches cannot
introduce a double-charge), and **every topic is partitioned by `userId`** (so
per-user ordering survives any number of partitions).

---

## 11. Open questions

1. **Remove `User.courses String[]`?** It is legacy and `Enrollment` is
   authoritative, but it reads like live data. Dropping it is a migration plus a
   grep. My preference is to drop it with the `prisma migrate` baseline (§8.2)
   so it costs nothing extra.
2. ~~**Take option A in §3.2 — delete `db.service.ts` and the transcoder's
   `prisma/`?**~~ **Resolved: done** in video-transcoder Phase 1. What is left of
   it is whether per-resolution progress is wanted at all; if it is, the
   `/processed` callback carries it.
3. **`Course.price` `Float` → `Decimal(10,2)` — when?** It is frontend-visible
   (JSON number becomes string), so it belongs in a coordinated change rather
   than a backend prerequisite. Sequence it with the buy-flow UI work.
4. **`tenant_id` on the `public` schema too?** Commerce and notifications carry
   it; `User`/`Course`/`Enrollment` do not. Today the system is single-tenant
   (`learnsphere`), so the choice is cheap now and painful later. My
   recommendation is to add it when `course-service` is extracted, since that is
   already a schema-creating event.
5. **Who owns `Video` after the split?** `Video.courseId` and the ownership
   checks in `middleware/ownership.ts` make Course and Video one aggregate in
   practice, which argues for `course-service`. Because the transcoder reaches
   the database only through a callback (§3.2), the move costs it one base-URL
   change.
6. **Soft delete for `Course`?** Deleting a course with paid enrolments against
   it would orphan receipts. There is no policy today. Probably `archivedAt`,
   never a hard delete — confirm.
