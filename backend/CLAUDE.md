# CLAUDE.md — backend

Express + TypeScript REST API. Port `5000` (falls back to `5001`). Read the root
`CLAUDE.md` alongside this file — in particular **Ways of Working**: HLD and LLD
are discussed and agreed before implementation, and implementation lands in
numbered phases.

## Commands

```
npm install
npm run dev            # ts-node-dev --respawn, entrypoint index.ts
npm run debug          # same, --inspect on 9229
npm test               # jest
npm run test:watch
npm run test:coverage
```

There is **no build or start script** — `dev` is the entrypoint. `start` exists
in `package.json` but is an empty string; don't call it.

Prisma: `prisma migrate` (baseline `0_init`, 28 Oct 2026): `npm run db:migrate -- --name <change>` creates a migration locally; `npm run db:migrate:deploy` applies them in CI and production; `npm run db:migrate:status` checks. Every schema change ships as a migration file, additive first (nullable column,
backfill, then enforce — DATABASE_DESIGN.md §8.2). `npx prisma generate` after any model edit.

## Layering

`routes → controllers → services → (Prisma / utils)`. Keep to it:

- `routes/` — path + middleware wiring only, mounted under `/api/v1` in `app.ts`
- `controllers/` — HTTP concerns; wrap every handler in `catchAsyncError`
- `services/` — business logic and all external I/O (Prisma, S3, Kafka, SQS)
- `utils/` — `ErrorHandler`, `redis`, `validation`, `db`, `money`

Errors flow `catchAsyncError` → `ErrorHandler` → `ErrorMiddleWare`. Never
`res.status(...).json(...)` an error directly from a controller; construct an
`ErrorHandler` and pass it to `next()`.

Validation lives in `utils/validation.ts` (Joi / express-validator). Logging is
winston.

## Authentication

**Dual-mode, supporting web and mobile from one codebase.** `isAuthenticated`
(`middleware/auth.ts`) reads the access token from, in order: the httpOnly
cookie (web), the `Authorization: Bearer` header, or the request body (mobile).
Any new protected route gets all three for free — do not hand-roll token reads.

- JWTs signed with `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET`
- Role gating via `authorizedRoles('user', ...)`; `role` lives on the `User`
  model and is embedded in the JWT
- Ownership checks in `middleware/ownership.ts`
- Signup is OTP/email based: register → OTP email (published to Kafka by
  `services/notification.service.ts`, delivered by notification-service) → `verify` →
  `isVerified=true`. The backend sends no email itself. The verify step accepts its token
  via `X-Verification-Token` / `X-Token` header, query string, or cookie.
- The refresh cookie is scoped to `path: /api/v1/users/refresh-token`
- Rate limiting is layered: 5-req/15-min on `/users/login` and `/users/register`,
  a general `RATE_LIMIT_MAX` (default 1000) per 15 min on all of `/api/v1`

## Environment

`import 'dotenv/config'` is the **first** import of `index.ts` and `app.ts`. Keep it there:
the S3 and Kafka clients read `process.env` while their modules load, and a later
`dotenv.config()` left them pointed at real AWS instead of LocalStack.

`app.ts` **hard-exits on startup** if `JWT_SECRET`, `ACCESS_TOKEN_SECRET`,
`REFRESH_TOKEN_SECRET` or `CLIENT_URL` are missing. Copy `.env.sample` → `.env`.

AWS endpoint selection goes through `config/awsConfig.ts` (`awsClientConfig()`),
driven by `LOCAL_STACK_DATA_SOURCE`: `true` → LocalStack (path-style,
`test`/`test` creds), `false` → real AWS. Never construct an AWS client with a
hand-written endpoint.

`TRANCODER_API_KEY` is **misspelled consistently** across the codebase. Match the
existing spelling; do not "fix" it in isolation.

`INTERNAL_API_KEY` guards `/api/v1/internal/*` (see below). Both API-key headers are
exempt from the general rate limiter in `app.ts` — service-to-service traffic must not
be throttled by a per-IP browser limit.

## Prisma schema

`backend/prisma/schema.prisma` is the **only** Prisma schema in the repo — the
transcoder's copy and its unused client were deleted (`../DATABASE_DESIGN.md`
§3.2), and it now reaches `Video` only through the `/processed` callback. Model
changes touch this file alone. Enums: `Role`, `InstructorRequestStatus`,
`EnrollmentSource`, `VideoStatus`, `JobStatus`.

Commerce fields added in Phase 0: `Course.currency` (default `INR`) and
`Enrollment.orderId` / `source` / `revokedAt`. `source` defaults to `FREE` because
every row that existed before commerce came from the free enrol endpoint. Refunds
will set `revokedAt` rather than delete, so purchase history survives.

**`Course.price` is deliberately still a `Float`.** Switching it to `Decimal` would
change its JSON type from number to string and break `CourseSummary.price` in the
frontend, so money is converted once at the boundary by `utils/money.ts`
(`toMinorUnits`) and crosses the wire as `amountMinor`. Nothing downstream re-derives
money from the float. Revisit together with the frontend, not in isolation.

## Internal (service-to-service) endpoints

`routes/internal.routes.ts` — mounted at `/api/v1/internal`, every route behind
`middleware/internalAuth.ts` (`X-Internal-Api-Key`, or `Authorization: Bearer <key>`,
checked against `INTERNAL_API_KEY`). No user session is involved; a browser cookie
will not get you in. It fails **closed** with a 500 when the key is unset rather than
silently allowing traffic.

- `GET /api/v1/internal/courses/:courseId` — the catalogue snapshot order-service
  takes when an order is created: `{ id, title, price, currency, isPublished,
  instructorId, amountMinor }`. It returns unpublished courses too — the *caller*
  decides purchasability; this route only reports facts.
- `GET /api/v1/internal/enrollments/:userId/:courseId` — `{ enrolled, enrollment }`.
  A row with `revokedAt` set reads as **not** enrolled, so a refunded buyer can
  purchase again; the row is still returned so the caller can explain why. This is
  how order-service blocks someone buying a course they already own — the one
  duplicate no unique index can catch, since the previous order is `PAID`.

This is the seam that lets the course domain move to its own service later
(`order-service/SYSTEM_DESIGN.md` §2.1): order-service depends on this contract,
never on the database.

## Enrolment is granted by orders

Students never enrol directly. `POST /api/v1/courses/:courseId/enroll` answers them
`402 { requiresOrder: true, courseId }`; for the course's instructor or an admin it is
a **grant** (`{ userId }` body, `source` `INSTRUCTOR` / `ADMIN_GRANT`).

Purchases arrive over Kafka: `services/kafkaConsumer.service.ts` (group `lms-backend`,
started from `index.ts`) consumes `order.paid` → `grantFromOrder` and `order.refunded`
→ `revokeFromOrder` (full refunds only). A malformed record is skipped; a database
error is rethrown so kafkajs retries rather than commits — enrolment is
retry-until-success, never dropped.

- **A row with `revokedAt` is not access.** `isEnrolled` checks it; so must anything new
  that gates on enrolment.
- `grantFromOrder` will not resurrect access revoked for the *same* order (a redelivered
  `order.paid` after its refund); `revokeFromOrder` only revokes what that order granted.
- `GET /api/v1/courses/enrolled` lists a user's active enrolments.
- The access token now carries `name` (receipts use it without a lookup).

## UI configuration

The frontend's presentation (branding, theme, nav, home copy, display-only toggles,
announcement) is one JSON document. **Contract and seed in git, live versions in the DB.**

- `config/ui/ui-config.schema.json` — the contract, served to the admin editor too. Keep it to
  the keywords `utils/uiConfigValidator.ts` implements; the validator refuses to start otherwise.
  `additionalProperties: false` everywhere: the read endpoint is public, so the document must
  never carry a secret.
- `config/ui/ui-config.default.json` — seeds v1 on first boot and is the fallback. After editing
  it run `cd ../frontend && npm run ui-config:sync` (a test fails if the copies drift).
  `npm run ui-config:export` writes the live version back here for a PR.
- `UiConfigVersion` is **append-only** — the audit log. Publish and rollback both append; publish
  uses a conditional update on `UiConfigState` as its optimistic lock (`409` on a stale base).
- `GET /api/v1/ui-config` is public and read from the DB on every request (`Cache-Control: no-cache`); `/api/v1/admin/ui-config/*` sits inside
  `admin.routes` and is ADMIN only.
- Display toggles are **never** security: hiding the Buy button does not stop a purchase.

## Video upload endpoints

`routes/videoUpload.routes.ts` / `controllers/videoUpload.controller.ts`:

1. `POST /api/v1/video-upload/presign` — auth, role `user`; returns a presigned
   S3 `uploadUrl` + `videoId`; key is `{videoId}/original.mp4`
2. `POST /api/v1/video-upload/` — saves the `Video` row (`UPLOADED`) and
   publishes Kafka `video.uploaded` via `services/kafka.service.ts`
3. `POST /api/v1/video-upload/:videoId/processed` — the transcoder's callback,
   authenticated by the `X-Transcoder-Api-Key` header
   (`middleware/transcoderAuth.ts`); sets `READY` + `hlsMasterPath`, plus the
   optional `duration` → `Video.duration` and `resolutions` → `Video.resolutions`,
   or `FAILED` with `{ error, errorCode }` → `Video.metadata`. Those optional fields
   are validated by `transcodeReportExtras` (`utils/validation.ts`) and **dropped,
   not rejected**, when malformed: a 4xx is final to the transcoder, so it must
   never cost a video its `READY`. An unknown video answers `404`, which tells the
   transcoder to stop reporting (a 500 would have Kafka redeliver the job forever)
4. `GET /api/v1/video-upload/:videoId` — metadata / playback URL

`services/sqs.service.ts` exists and unwraps the SNS-style envelope LocalStack
adds, but `startSQSConsumer` is **never invoked** — it is reference for a planned
S3→SQS→Kafka bridge. Keep it; do not delete it. Same for `bullmq`: a dependency,
imported nowhere, kept deliberately.

## Tests

Jest + ts-jest under `tests/`, config in `jest.config.js` / `tsconfig.test.json`.

- `@prisma/client` is auto-mocked by the shared deep mock in
  `__mocks__/@prisma/client.ts` — don't re-mock it per test file
- AWS SDK v3 via `aws-sdk-client-mock`; `kafkajs` and `services/notification.service` via `jest.mock`
- Integration tests hit real routes through `tests/helpers/testApp.ts`, which
  builds the app **without the rate limiter**
- Current coverage: auth (service/middleware/routes), courses, admin,
  instructor requests, s3, kafka, sqs, video, internal catalogue route, money
- **Run `npx prisma generate` before `npm test`.** Without it `@prisma/client` ships
  stub types and every suite importing a route fails to *compile* — it looks like a
  broken test suite and is not one.

New service or route work should arrive with tests in the matching
`tests/unit/` or `tests/integration/` file.

## Comments

Minimal, generic, to the point. One short line explaining *why* beats a block
restating *what*. No JSDoc on self-explanatory functions, no step-by-step
narration.
