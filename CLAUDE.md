# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Each service also carries its own `CLAUDE.md` (`backend/`, `frontend/`, `video-transcoder/`, `notification-service/`). Read the service-level file **in addition to** this one when working inside that service.

## Ways of Working — read this before writing any code

**Design first, in two passes, then implement in phases.** This applies to every new service and every substantial feature. It is not optional and should not need restating per task.

1. **HLD — discuss the high-level design.** What the thing is for and explicitly is *not* for; where it sits in the monorepo; the components and the data flow between them; the contracts (topics, event schemas, API shapes) other services will code against; the trade-offs, with the reasoning written down rather than implied.
2. **LLD — discuss the low-level design.** Package/module layout; interfaces, class and function signatures; database schemas and entities; request/response bodies; error classification and handling; configuration keys and their defaults.
3. **Only then implement**, and implement **in phases** — never the whole design in one pass.

**"Discussed" means the user has reacted to the written design**, not that a design document merely exists. Do not begin implementation code off the back of a design the user has not yet responded to. When a request sounds like "build X" or "let's make X", the first deliverable is the design document, not X. Scoping questions up front are welcome, but answers to them are an input to the design — never a substitute for it.

**Phased delivery.** Every design ends with a numbered phase plan stating what ships first, what comes later, and what is deliberately deferred. Each phase must be independently reviewable and must leave the service in a working state. Finish and verify one phase — it compiles, it runs, it does what the phase claimed — before starting the next. Report honestly when a phase is written but unverified.

**Where designs live.** `<service>/SYSTEM_DESIGN.md`, in the repository next to the code it describes, so it stays reviewable and editable alongside it. Every service has one: `backend/`, `frontend/`, `video-transcoder/`, `order-service/`, `notification-service/`.

Two documents sit above them at the repo root and win on anything cross-cutting:

| Document | Owns |
|---|---|
| `ARCHITECTURE.md` | System boundaries, current vs target topology, the technology roadmap (what we use now and what is coming), the scaling plan, deployment |
| `DATABASE_DESIGN.md` | Data ownership (**one writer per table**), schema boundaries, money representation, indexes, migrations, retention and PII |

Where a service doc and a root doc disagree about that service's *internals*, the service doc wins; about a *boundary between services*, the root doc wins.

**Diagrams** are checked-in diagram-as-code under `docs/diagrams/`, rendered in the shared Eraser workspace **LearnSphere - System Architecture**. Edit the source, then re-paste into Eraser — never only one of the two.


## Project Status & Roadmap

> **`todo.md` is the live roadmap** — phase status per service, derived from the design docs. This section reflects the **verified** state of the code; where the two disagree, re-verify against the code and fix both.

**Done**
- **Auth (backend)** — complete: register → OTP verify → login → refresh → me → logout (+ reverify). JWT access/refresh + activation tokens, bcrypt, dual-mode (cookie/Bearer/body), role gating, rate limiting. Redis (`ioredis`) used for OTP/session.
- **Video pipeline (backend)** — wired: `presign → confirm (publishes Kafka video.uploaded) → transcoder callback /:videoId/processed (API-key) → getVideo`.
- **video-transcoder** — Phases 1–3a of its `SYSTEM_DESIGN.md`: startup config validation, transient/permanent failure classification with retries and Kafka heartbeats during long encodes, and a **source-aware HLS ladder** — ffprobe first, the top rung at the source's own size (up to 2160p), every standard rung below it, never an upscale, portrait kept portrait — plus a poster frame. Duration, renditions and a failure `errorCode` are reported back through the callback.
- **Frontend** — pages (home, login, signup, verify, dashboard, admin, courses/new, courses/[id], courses/[id]/manage), typed API layer (axios + single-flight auto-refresh), `hls.js` player with the native-HLS branch for Safari.

**Gaps / built-but-not-wired**
- **SQS→Kafka bridge** — `startSQSConsumer` is *defined but never invoked*. The Kafka event currently originates from the backend `confirm` call, not from S3 events. **Planned: to be wired up later — keep as reference, do not delete.**
- **BullMQ + Redis job queue** — *not used* (`bullmq` imported nowhere; only `ioredis` for OTP). **Planned for later — keep as reference.**
- **Transcoder playback** — ✅ **this is wired.** `video-transcoder/src/index.ts` streams HLS from the processed S3 bucket at `/api/video-transcoder/hls/*` with `Range` support; there is no local sample and `src/constants/` no longer exists. The remaining work is moving those bytes to a CDN (`ARCHITECTURE.md` §6.2) — serving them from the transcoder process is the system's current bandwidth bottleneck.
- **Frontend** — `videos.service.ts`, `courses.service.ts`, `admin.service.ts` and a `video-upload` component all exist. What is missing is the commerce client (`orders.service.ts`), upload progress and honest polling timeouts — `frontend/SYSTEM_DESIGN.md` Part III.
- **Commerce (orders/payments)** — **Phases 0–6 built and verified on local infra**: a mock purchase runs create → webhook → `PAID` → `order.paid` → enrolment → receipt end to end. Razorpay and Stripe are unit-tested only (no test-mode purchase yet). See
  `order-service/SYSTEM_DESIGN.md`: a Spring Boot service owning Order/Payment/Refund,
  several gateways behind one `PaymentProvider` interface, payment→enrolment joined
  by a Kafka `order.paid` event rather than a shared table. Phase 0 (the catalogue
  prerequisites in `backend/`) and Phases 1–6 are done.
- **notification-service** — Phases 0–5 built and tested with Maven (67 pass, 1 gated on `NOTIFICATION_IT`): email, push (FCM), SMS (Twilio), retry topics + DLQ + admin replay, Redis rate limits, metrics, template seeding. It is now the only sender of email — the backend publishes to Kafka. Critical-message availability is designed (`SYSTEM_DESIGN.md` §14), not built.
- **Tests** — backend has a Jest suite and video-transcoder a `node:test` suite; frontend has none.

**Next plan (priority order)**
- **P0** — Commerce, phase by phase per `order-service/SYSTEM_DESIGN.md` Part III.
  Phase 0 ✅ · Phase 1 order-service on the mock provider · Phase 2 enrolment granted
  from `order.paid` · Phase 3 receipts · Phase 4 Razorpay + buy flow · Phase 5 Stripe
  · Phase 6 refunds.
- **P1** — End-to-end upload in the browser: switch the transcoder from its local HLS
  sample to S3-backed playback; verify the full chain on local infra.
- **P2** — Service split: `backend/` reduces to **auth-service**; `Course`/`Enrollment`/
  `Video` move to a **course-service** (undesigned — needs its own `SYSTEM_DESIGN.md`).
  `video-transcoder` reaches the database only through the `/processed` callback, so
  the move costs it one base-URL change (its dead Prisma client is already gone —
  `DATABASE_DESIGN.md` §3.2).
- **P3** — SQS→Kafka bridge + BullMQ queue (reference-only today; the user will build these).
- **P4** — notification-service: push channel, retry/DLQ, template seeding.
- **P5** — Monitoring/metrics, finalize `deploy/` K8s manifests.

## Overview

LearnSphere is a multi-service learning-management platform built around video courses. It is a polyglot monorepo with **five** independently-runnable services, communicating over Kafka and HTTP. They share one Postgres **instance** but **one schema per service** — nobody writes anybody else's tables (`DATABASE_DESIGN.md` §1). All infrastructure (Postgres, Redis, Kafka, LocalStack, MongoDB) runs locally via `docker-compose.yml`.

```
frontend (Next.js :3000) ──HTTP──▶ backend (Express/TS :5000) ──Kafka──▶ video-transcoder (Node/TS :7000)
                                       │                                      │
                                       ├── Postgres, schema `public` (Prisma)  │
                                       ├── Redis (OTP / session)               │
                                       └── S3 (raw bucket, presign) ───────────┘ (reads raw, writes processed)

order-service (Spring :8086)        — Postgres schema `orders` (Flyway) · Kafka `order.*` · Phases 1–6 built
notification-service (Spring :8085) — Mongo · Redis · Kafka `notifications` · tenant-aware

S3 is LocalStack locally and real AWS in production, switched by `LOCAL_STACK_DATA_SOURCE`.
Full picture, including the target topology and the scaling plan: `ARCHITECTURE.md`.
```

## Services & Commands

Each service has its own dependencies and is run separately. Start infra first: `docker compose up -d` from the repo root.

### backend/ — Express + TypeScript REST API (port 5000/5001)
- `npm install` then `npm run dev` (ts-node-dev with respawn) — there is **no build/start/test script wired up**; `dev` is the entrypoint (`index.ts`).
- `npm run debug` — same with `--inspect` on 9229.
- Prisma uses **`npx prisma db push`** to sync schema (see comment atop `prisma/schema.prisma`); `npx prisma generate` after schema edits.
- Requires env vars `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `CLIENT_URL` — `app.ts` hard-exits on startup if any are missing. Copy `.env.sample` → `.env`.

### frontend/ — Next.js 14 App Router + Tailwind + shadcn-style UI (port 3000)
- `npm install` then `npm run dev`. `npm run build`, `npm run start`, `npm run lint`.
- Uses `@/` path alias for `src/`.

### video-transcoder/ — Node/TS Kafka consumer, FFmpeg transcoding (port 7000)
- **npm**, like every other Node service; ESM (`"type": "module"`, `tsx`).
- `npm install`, `npm run dev` (tsx watch), `npm test` (`node:test`), `npm run build` (tsc), `npm start`.
- FFmpeg and FFprobe are bundled (`@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`); `FFMPEG_PATH` / `FFPROBE_PATH` override them. Both are checked at startup.
- **No database client and no Prisma schema** — it reports everything through the backend's `/processed` callback (`DATABASE_DESIGN.md` §3.2).
- Ladder tuning: `TRANSCODE_MAX_RUNG` (default `2160`), `TRANSCODE_PRESET` (default `veryfast`).
- Serves HLS from the processed S3 bucket at `/api/video-transcoder/hls/*`. That is the platform's current bandwidth bottleneck and moves to a CDN in its Phase 4.

### order-service/ — Spring Boot / Java (port 8086)
- `./mvnw spring-boot:run` to run, `./mvnw test`, `./mvnw compile`.
- Java 21 / Boot 4.0.3 / `com.lms.order_service`, matching `notification-service`. `make order` from the root.
- **Phases 1–6 built; 54 tests pass** (48 unit + the Testcontainers flow, which skips without Docker): Flyway schema, JWT filter, mock / Razorpay / Stripe providers behind one registry, state machine, orders + cancel/retry/history, webhook pipeline, outbox relay, reconciliation sweeper, rate limit, refunds + admin. Observability (§12.6) is still owed before real money.

### notification-service/ — Spring Boot 4 / Java 21 (port 8085)
- `./mvnw spring-boot:run` to run, `./mvnw test` to test, `./mvnw clean package` to build.
- Delivers email, push and SMS from Kafka `notifications`; see its `README.md` and `SYSTEM_DESIGN.md`.

### Tests
- **backend** has a Jest + ts-jest suite under `backend/tests/` — `npm test`, `npm run test:watch`, `npm run test:coverage`. `@prisma/client` is auto-mocked via `backend/__mocks__/@prisma/client.ts` (shared deep mock); AWS SDK v3 via `aws-sdk-client-mock`; `kafkajs` and `services/notification.service` via `jest.mock`. Integration tests hit the real routes through `tests/helpers/testApp.ts` (no rate limiter). Covers auth (service/middleware/routes), s3, kafka, sqs, video services, the internal
catalogue route and `utils/money`. **`npx prisma generate` must have run**, or every
suite that imports a route fails to compile (`Prisma` namespace members missing).
- **video-transcoder** has a `node:test` suite under `src/**/*.test.ts` — `npm test` (ladder, master playlist, probe incl. a real-ffprobe rotation check, job retry/classification, callback, config). **order-service** and **notification-service**: `./mvnw clean test` (order-service's Testcontainers test skips without Docker).

## Architecture Notes

### Authentication (backend)
- **Dual-mode auth** supporting both web and mobile: `isAuthenticated` (`middleware/auth.ts`) reads the access token from an httpOnly **cookie** (web), the `Authorization: Bearer` header, OR the request body (mobile). Tokens are JWTs signed with `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`.
- Role gating via `authorizedRoles('user', ...)`. The `role` lives on the `User` Prisma model and is embedded in the JWT.
- Signup flow is **OTP/email-verification based**: register → OTP email (published to Kafka `notifications`, sent by notification-service) → `verify` (accepts token via header `X-Verification-Token`/`X-Token`, query, or cookie) → `isVerified=true`. See `routes/user.routes.ts`.
- Rate limiting is layered: a strict 5-req/15-min limiter on `/users/login` and `/users/register`, and a general limiter on all of `/api/v1` at `RATE_LIMIT_MAX` requests per IP per 15 minutes (**default 1000**, `app.ts:44`). Both the `X-Internal-Api-Key` and `X-Transcoder-Api-Key` paths are exempt — service-to-service traffic must not be throttled by a per-IP browser limit.
- All routes are mounted under `/api/v1` in `app.ts`. Errors flow through `catchAsyncError` wrapper → `ErrorHandler` class → `ErrorMiddleWare`.

### Video upload & transcoding pipeline (the core flow)
This spans backend + video-transcoder + S3/SQS/Kafka. End to end (`backend/routes/videoUpload.routes.ts`, `controllers/videoUpload.controller.ts`):
1. **Presign** — `POST /api/v1/video-upload/presign` (auth, role `user`) returns an S3 presigned `uploadUrl` + `videoId`; key is `{videoId}/original.mp4`.
2. **Direct upload** — frontend PUTs the file straight to S3 (LocalStack locally, real AWS in prod).
3. **Confirm** — `POST /api/v1/video-upload/` saves metadata (Prisma `Video`, status `UPLOADED`) and **publishes a Kafka `video.uploaded` event** (`services/kafka.service.ts`).
4. **Transcode** — `video-transcoder` consumes Kafka, downloads from S3, probes the source and builds a source-aware ladder (top rung at the source's size up to 2160p, never upscaled), encodes each rendition to HLS, writes `master.m3u8` and `poster.jpg`, uploads to the processed bucket under `{videoId}/`. (S3 ObjectCreated → SQS → Kafka bridging also exists via `services/sqs.service.ts`, which unwraps SNS-style envelopes that LocalStack adds.)
5. **Callback** — transcoder calls back `POST /api/v1/video-upload/:videoId/processed`, authenticated by an **API key** (`X-Transcoder-Api-Key` header, env `TRANCODER_API_KEY` — note the misspelling), to set status `READY` + `hlsMasterPath` (plus `duration` and `resolutions`), or `FAILED` with `error` + `errorCode` (`CORRUPT_OR_UNSUPPORTED` / `SOURCE_MISSING` / `GAVE_UP` / `UNKNOWN`, stored in `Video.metadata`).
6. **Playback** — `GET /api/v1/video-upload/:videoId` returns metadata/playback URL; frontend plays HLS via `hls.js` (`frontend/src/lib/player.tsx`).

`VideoStatus`: `UPLOADED → TRANSCODING → READY/FAILED`. Per-resolution `VideoTranscodeJob` rows track `QUEUED → PROCESSING → COMPLETED/FAILED`.

### One Prisma schema
Only `backend/prisma/schema.prisma` exists. The transcoder's former copy and its unused client were deleted (`DATABASE_DESIGN.md` §3.2); model changes touch the backend alone.

### Frontend API layer
All backend communication goes through a single typed layer under `frontend/src/lib/api/`:
- `config/env.ts` is the **only** place that reads `process.env` (validates at startup, throws in prod, falls back in dev). Import the typed `env` object elsewhere.
- `client.ts` — single axios instance (`withCredentials: true` for cookie auth) with an interceptor that auto-refreshes on 401 (except for `NON_REFRESHABLE_PATHS` like login/verify so their own errors reach callers).
- `endpoints.ts` — central registry of all paths; never hand-type URLs.
- `users.service.ts` — typed wrappers UI components call. Barrel-exported from `lib/api/index.ts`.
- Route groups: `app/login`, `app/signup`, `app/verify` (OTP), `app/dashboard`, `app/video-transcoder`. `hooks/useGuestOnly.ts` guards auth pages.

### notification-service (Spring)
Multi-tenant by design: `NotificationApiFilter` requires an `X-Tenant-Id` header on every `/api/**` request and stashes it in a thread-local `NotificationContextHolder` (cleared after each request). Entities extend `AbstractEntity`; exceptions extend `AbstractException` with a `GlobalExceptionHandler`.

## Local Infrastructure (docker-compose.yml)
| Service | Port | Notes |
|---|---|---|
| Postgres | 5434→5432 | `testUser` / `mysecretpassword` / `testDB` |
| Redis | 6379 | password `local` |
| Kafka (KRaft) | 9092 (host), 29092 (internal) | UI at :8080 |
| LocalStack (S3+SQS+SNS) | 4566 | local AWS; replaced MinIO. Also `localstack-file.yml` variant |
| MongoDB | 27017 | `mongo` / `mongo123`, UI :8081 |
| RedisInsight | 5540 | Postgres has **no web UI** — use `docker exec -it postgres_db psql -U testUser -d testDB` (pgAdmin was removed; see `README.md` → Database) |

**AWS vs LocalStack**: both backend and video-transcoder pick their AWS endpoint from `LOCAL_STACK_DATA_SOURCE` — `true` → LocalStack (`LOCALSTACK_ENDPOINT`, path-style, `test`/`test` creds), `false` → real AWS. Backend reads it via `config/awsConfig.ts` (`awsClientConfig()`); the transcoder via `src/config/conf.ts`.

## Conventions
- **Comments**: keep them minimal, generic, and to the point. Prefer one short line explaining *why* over multi-line blocks restating *what* the code does. Don't add a comment unless it earns its place — no step-by-step narration, no JSDoc on self-explanatory functions.
- Backend follows a routes → controllers → services → (Prisma/utils) layering. Validation via Joi/express-validator schemas in `utils/validation.ts`. Logging via winston.
- Env var `TRANCODER_API_KEY` is misspelled consistently across code — match the existing spelling rather than "correcting" it in isolation.
- `todo.md` (repo root) is the live roadmap: phase status per service and what ships next. It is derived from the design docs — if the two disagree, the design doc wins and `todo.md` needs updating.
