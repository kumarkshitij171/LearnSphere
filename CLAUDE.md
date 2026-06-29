# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status & Roadmap

> **`todo.md` is a stale planning doc — do not trust its unchecked boxes.** It describes an in-backend BullMQ worker design that was *deliberately re-architected* into a separate `video-transcoder` service with HLS output. This section reflects the **verified** state of the code.

**Done**
- **Auth (backend)** — complete: register → OTP verify → login → refresh → me → logout (+ reverify). JWT access/refresh + activation tokens, bcrypt, dual-mode (cookie/Bearer/body), role gating, rate limiting. Redis (`ioredis`) used for OTP/session.
- **Video pipeline (backend)** — wired: `presign → confirm (publishes Kafka video.uploaded) → transcoder callback /:videoId/processed (API-key) → getVideo`.
- **video-transcoder** — real FFmpeg→HLS transcode, S3 download/upload (incl. HLS segment dirs), Kafka consumer, backend callback.
- **Frontend** — pages (login/signup/verify/dashboard/video-transcoder/home), typed API layer (axios + auto-refresh), `hls.js` player.

**Gaps / built-but-not-wired**
- **SQS→Kafka bridge** — `startSQSConsumer` is *defined but never invoked*. The Kafka event currently originates from the backend `confirm` call, not from S3 events. **Planned: to be wired up later — keep as reference, do not delete.**
- **BullMQ + Redis job queue** — *not used* (`bullmq` imported nowhere; only `ioredis` for OTP). **Planned for later — keep as reference.**
- **Transcoder playback** — `index.ts` currently serves a checked-in local HLS sample (`src/constants/out/hls/`), not S3 objects. Real S3-backed playback isn't connected to the frontend.
- **Frontend upload UX** — no video upload/status-polling component yet; only `usersApi` exists (no `videos.service.ts`).
- **Courses/payments** — `Course` Prisma model only; no routes/controllers/UI.
- **notification-service** — Spring scaffold only (`Template` entity + tenant filter); no consumers/senders.
- **Tests** — none in any Node service.

**Next plan (priority order)**
- **P0** — End-to-end upload in the browser: frontend `videos.service.ts` + upload/status UI; switch transcoder from local sample to S3-backed HLS; verify full chain on local infra (MinIO + Kafka).
- **P1** — Implement the SQS→Kafka bridge + BullMQ queue (currently reference-only; the user will build these).
- **P2** — Courses domain (CRUD + catalog UI) to make it a real LMS.
- **P3** — notification-service: Kafka consumer + email/template sender (move OTP emails off the backend).
- **P4** — Tests, monitoring/metrics, finalize `deploy/` K8s manifests.

## Overview

LMS is a multi-service learning-management platform built around video courses. It is a polyglot monorepo with four independently-runnable services that communicate through a shared Postgres database and message queues (SQS → Kafka). All infrastructure (Postgres, Redis, Kafka, MinIO, LocalStack, MongoDB) runs locally via `docker-compose.yml`.

```
frontend (Next.js)  ──HTTP──▶  backend (Express/TS)  ──Kafka──▶  video-transcoder (Node/TS)
                                       │                                    │
                                       ├── Postgres (Prisma, shared schema) ┘
                                       ├── Redis (sessions / OTP cache)
                                       └── S3/MinIO (raw + processed video)
notification-service (Spring Boot) — Kafka/Mongo/Redis, tenant-aware (early scaffolding)
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
- **Uses pnpm** (`packageManager: pnpm@10.28.0`), ESM (`"type": "module"`, `tsx`).
- `pnpm install` (runs `prisma generate` via postinstall), `pnpm dev` (tsx watch), `pnpm build` (tsc), `pnpm start`.
- Requires FFmpeg on PATH (or via `@ffmpeg-installer/ffmpeg`). Has its **own `prisma/` schema** separate from backend's.

### notification-service/ — Spring Boot 4 / Java 21 (port 8085)
- `./mvnw spring-boot:run` to run, `./mvnw test` to test, `./mvnw clean package` to build.
- Early scaffolding: only Template entity + tenant filter exist so far. Mongo + Kafka + Redis starters are wired in.

### Tests
- **backend** has a Jest + ts-jest suite under `backend/tests/` — `npm test`, `npm run test:watch`, `npm run test:coverage`. `@prisma/client` is auto-mocked via `backend/__mocks__/@prisma/client.ts` (shared deep mock); AWS SDK v3 via `aws-sdk-client-mock`; `kafkajs`/`sendMail` via `jest.mock`. Integration tests hit the real routes through `tests/helpers/testApp.ts` (no rate limiter). Covers auth (service/middleware/routes), s3, kafka, sqs, video services.
- **video-transcoder** has no tests yet. **notification-service** has the Spring `*Tests.java` scaffold (`./mvnw test`).

## Architecture Notes

### Authentication (backend)
- **Dual-mode auth** supporting both web and mobile: `isAuthenticated` (`middleware/auth.ts`) reads the access token from an httpOnly **cookie** (web), the `Authorization: Bearer` header, OR the request body (mobile). Tokens are JWTs signed with `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`.
- Role gating via `authorizedRoles('user', ...)`. The `role` lives on the `User` Prisma model and is embedded in the JWT.
- Signup flow is **OTP/email-verification based**: register → email OTP (nodemailer + EJS templates in `backend/views/`) → `verify` (accepts token via header `X-Verification-Token`/`X-Token`, query, or cookie) → `isVerified=true`. See `routes/user.routes.ts`.
- Rate limiting is layered: a strict 5-req/15-min limiter on `/users/login` and `/users/register`, a general 100-req limiter on all `/api/v1`.
- All routes are mounted under `/api/v1` in `app.ts`. Errors flow through `catchAsyncError` wrapper → `ErrorHandler` class → `ErrorMiddleWare`.

### Video upload & transcoding pipeline (the core flow)
This spans backend + video-transcoder + S3/SQS/Kafka. End to end (`backend/routes/videoUpload.routes.ts`, `controllers/videoUpload.controller.ts`):
1. **Presign** — `POST /api/v1/video-upload/presign` (auth, role `user`) returns an S3 presigned `uploadUrl` + `videoId`; key is `{videoId}/original.mp4`.
2. **Direct upload** — frontend PUTs the file straight to S3 (LocalStack locally, real AWS in prod).
3. **Confirm** — `POST /api/v1/video-upload/` saves metadata (Prisma `Video`, status `UPLOADED`) and **publishes a Kafka `video.uploaded` event** (`services/kafka.service.ts`).
4. **Transcode** — `video-transcoder` consumes Kafka, downloads from S3, runs FFmpeg into multiple resolutions / HLS, uploads to the processed bucket. (S3 ObjectCreated → SQS → Kafka bridging also exists via `services/sqs.service.ts`, which unwraps SNS-style envelopes that LocalStack adds.)
5. **Callback** — transcoder calls back `POST /api/v1/video-upload/:videoId/processed`, authenticated by an **API key** (`X-Transcoder-Api-Key` header, env `TRANCODER_API_KEY` — note the misspelling), to set status `READY` + `hlsMasterPath`.
6. **Playback** — `GET /api/v1/video-upload/:videoId` returns metadata/playback URL; frontend plays HLS via `hls.js` (`frontend/src/lib/player.tsx`).

`VideoStatus`: `UPLOADED → TRANSCODING → READY/FAILED`. Per-resolution `VideoTranscodeJob` rows track `QUEUED → PROCESSING → COMPLETED/FAILED`.

### Shared Prisma schema, two copies
The backend and video-transcoder each carry their own `prisma/schema.prisma` against the **same Postgres DB**. When changing models (`User`, `Course`, `Video`, `VideoTranscodeJob`), keep both schemas in sync and regenerate clients in both services.

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
| pgAdmin | 5050 | RedisInsight :5540 |

**AWS vs LocalStack**: both backend and video-transcoder pick their AWS endpoint from `LOCAL_STACK_DATA_SOURCE` — `true` → LocalStack (`LOCALSTACK_ENDPOINT`, path-style, `test`/`test` creds), `false` → real AWS. Backend reads it via `config/awsConfig.ts` (`awsClientConfig()`); the transcoder via `src/config/conf.ts`.

## Conventions
- **Comments**: keep them minimal, generic, and to the point. Prefer one short line explaining *why* over multi-line blocks restating *what* the code does. Don't add a comment unless it earns its place — no step-by-step narration, no JSDoc on self-explanatory functions.
- Backend follows a routes → controllers → services → (Prisma/utils) layering. Validation via Joi/express-validator schemas in `utils/validation.ts`. Logging via winston.
- Env var `TRANCODER_API_KEY` is misspelled consistently across code — match the existing spelling rather than "correcting" it in isolation.
- `todo.md` (repo root) tracks planned work and is large; consult it for intended-but-unbuilt features.
