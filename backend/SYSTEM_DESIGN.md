# Backend — System Design

Status: **current state verified** against the code. **Target state and the
phase plan are design for review — no code written for them.**
Port `5000` (see §15.1). Express + TypeScript + Prisma.

Per the root `CLAUDE.md` **Ways of Working** this is the HLD and the LLD for
this service. Implementation waits for your reaction and then proceeds phase by
phase.

Wider context: `../ARCHITECTURE.md` (system boundaries, scaling),
`../DATABASE_DESIGN.md` (data ownership, migrations). Where this document and
those disagree about a boundary, they win; about this service's internals, this
one wins.

---

# Part I — HLD

## 1. Purpose and scope

`backend/` is the service the browser talks to. Today it owns **four domains**:

| Domain | Surface |
|---|---|
| **Identity** | register → OTP verify → login → refresh → me → logout, roles, RBAC |
| **Catalogue** | `Course` CRUD, publishing, `Enrollment` |
| **Video intake** | presign, confirm, the transcoder callback, playback metadata |
| **Internal API** | the service-to-service contract other services code against |

That is three domains too many for one service, and §4 is the plan to reduce it
to identity. Everything in this document is written so that reduction is a move
rather than a rewrite.

**In scope.** HTTP, authentication and authorisation, validation, business logic
and all Postgres access for the domains above; producing `video.uploaded`;
presigned S3 URLs; being the authority on who may watch what.

**Explicitly out of scope.** Transcoding (`video-transcoder`), sending any
message (`notification-service`), money (`order-service`), serving video bytes
(the transcoder today, a CDN tomorrow).

**Non-goals for now.** GraphQL, a DI container, a repository layer (§6), server
rendering (the frontend owns that), websockets.

---

## 2. Where it sits

```
  frontend :3000
      │  httpOnly cookie (web) · Bearer (mobile) · body (mobile)
      ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  backend :5000                                               │
  │                                                              │
  │  routes ─▶ middleware ─▶ controllers ─▶ services ─▶ Prisma    │
  │            auth, rbac,                                       │
  │            ownership,                                        │
  │            rate limit,                                       │
  │            error                                             │
  └──┬──────────┬───────────┬──────────────┬─────────────────┬───┘
     │          │           │              │                 │
     ▼          ▼           ▼              ▼                 ▼
  Postgres    Redis       S3            Kafka            SMTP
  (public)   OTP,      presign +     produce            OTP mail
             session   delete        video.uploaded      (moves to
                                                     notification-service)
     ▲                                     ▲
     │  X-Internal-Api-Key                 │  X-Transcoder-Api-Key
     │  GET /api/v1/internal/*             │  POST /video-upload/:id/processed
  order-service                         video-transcoder
```

---

## 3. Design decisions and why

| Decision | Rationale |
|---|---|
| **Dual-mode auth: cookie, Bearer header, or body** | One codebase serves web and a future mobile client. `isAuthenticated` reads all three in order, so every new protected route gets all three for free and nobody hand-rolls a token read |
| **httpOnly cookie for the web client** | The access token is never reachable from JavaScript, which removes the whole class of XSS token theft. The cost is CSRF exposure and cross-origin awkwardness — §8.3 |
| **Refresh cookie scoped to `/api/v1/users/refresh-token`** | The long-lived credential is not sent on every request, so it is not in the blast radius of an unrelated endpoint bug |
| **Refresh token hashed into `User.extended.session`** | Lets a session be revoked server-side, which a pure stateless JWT cannot do, without a sessions table. Keeping it in JSON means session shape changes need no migration; the trade is that it is not queryable, and nothing queries it |
| **OTP email verification before login** | Blocks throwaway-address signup at the cheapest point. `isVerified` is a column, not an inference |
| **Role on the `User` row and embedded in the JWT** | Authorisation needs no database round trip. The cost is that a role change applies on the user's next refresh, ≤ access-token TTL — stated in the README so it is not a surprise |
| **Ownership as middleware, not controller code** | `requireCourseOwner` attaches `req.course` and settles 404 vs 403 in one place. Repeating that per handler is how one handler ends up missing it |
| **Layered rate limits** | 5 req/15 min on login and register makes credential stuffing expensive; the general `/api/v1` limiter is the backstop. **Both API-key headers are exempt** — service-to-service traffic must not be throttled by a per-IP browser limit |
| **Errors always via `ErrorHandler` → `ErrorMiddleWare`** | One response shape, one place that decides status codes. A controller that writes an error itself is a bug, and §13 makes that lintable |
| **S3 presign instead of proxying uploads** | A 2 GB video never touches this process. Direct browser→S3 PUT keeps the API's memory profile flat regardless of file size |
| **Produce `video.uploaded`; never call the transcoder** | The transcoder can be down, redeployed or scaled to zero and nothing is lost. The event waits in the log |
| **`prisma db push`, not `migrate`** | A deliberate dev-speed trade while the schema is being reshaped. `../DATABASE_DESIGN.md` §8.2 names the trigger to abandon it: the first environment whose data we would be sorry to lose |
| **Internal API behind an API key, failing closed** | `middleware/internalAuth.ts` returns `500` when `INTERNAL_API_KEY` is unset rather than allowing traffic. A misconfigured deploy must not become an open internal API |
| **`/internal/courses/:id` returns unpublished courses** | Purchasability is the *caller's* policy. This route reports facts; hiding the row would make "why did my order fail" harder to answer than a `402` with a reason |

### Rejected

| Option | Why not |
|---|---|
| Sessions in Postgres or Redis instead of JWT | Adds a read to every authenticated request to regain revocation we already have via the hashed refresh token |
| Access tokens in `localStorage` | Readable by any injected script. The cookie's CSRF exposure is the better trade, and it is mitigable |
| Splitting `auth.controller` from `user.controller` now | Tidier, but it widens a security-sensitive diff while the data-access move (Phase 3) is in flight. Deferred to Phase 5, deliberately |
| A repository layer | §6 |
| `prisma migrate` right now | It is the right answer for production and premature while models change daily. Scheduled, not rejected |

---

## 4. The reduction to `auth-service`

`backend/` is the target of P2 in the roadmap: keep identity, move the course
domain to `course-service`.

```
  today                              target
  ─────                              ──────
  backend/   User, auth, tokens      auth-service    User, auth, tokens
             Course, Enrollment      course-service  Course, Enrollment, Video
             Video, presign                          + presign + the transcoder callback
             internal API                            internal API moves with its domain
```

**What makes this a move rather than a rewrite:** `order-service` depends on
`/api/v1/internal/*` and on the `order.paid`/`order.refunded` contracts, never
on the database. Those contracts are written against the *domain*, so they
survive the move unchanged and `order-service` changes by zero lines.

**What is genuinely hard about it**, recorded so it is not discovered late:

1. **`video-transcoder` carries a second Prisma schema**, though the code that
   would use it is dead and never imported, so the service actually reaches the
   database only through the `/processed` callback. Moving `Video` therefore
   costs it one base-URL change — provided the dead client and duplicated schema
   are deleted first (`../DATABASE_DESIGN.md` §3.2, option A).
2. **`middleware/ownership.ts` spans both halves** — it reads `Course` to
   authorise a `Video` action. After the split that is a `course-service`
   concern entirely, which is tidy, but it means video intake moves *with* the
   course domain rather than staying here.
3. **Only `User` stays.** That is a small service, which is correct: identity
   has a different change rate and a different blast radius from everything
   else.

The phases in Part III are sequenced so the layering is correct *before* the
split, because moving tangled code is how a migration turns into a rewrite.

---

## 5. Target layering

```
  routes/          path + middleware wiring only
      │
  middleware/      cross-cutting: auth, rbac, ownership, rate limit, errors
      │
  controllers/     HTTP: parse, policy, status codes, cookies, response shape
      │
  services/        business logic + ALL data access   ← the only Prisma importers
      │
  utils/prisma.ts  one PrismaClient for the process
      │
  Postgres
```

| Layer | May | Must not |
|---|---|---|
| `routes/` | compose paths and middleware | contain logic |
| `controllers/` | read `req`, set cookies/status, call services, construct `ErrorHandler` | import `@prisma/client`, build queries |
| `services/` | import the shared `prisma`, compose queries, own transactions | touch `req`/`res`, throw HTTP concerns |
| `middleware/` | call services, short-circuit with `next(new ErrorHandler(...))` | import `@prisma/client` |
| `utils/prisma.ts` | be the only `new PrismaClient()` in the repo | contain query logic |

### 5.1 Three defects that break this today

**① The Prisma "singleton" is seven singletons.** `new PrismaClient()` appears
in seven production files: `services/user.service.ts:14`,
`services/course.service.ts:4`, `services/video.service.ts:5`,
`services/admin.service.ts:3`, `services/instructorRequest.service.ts:3`,
`controllers/user.controller.ts:10`, `middleware/ownership.ts:6`.
`utils/db.ts` looks like it was meant to prevent exactly this — it declares
`DB_URL` and exports `connectDB()`, **whose body is empty**, and `index.ts:7`
calls it, so the file reads as if connection management is handled when nothing
happens at all.

Two consequences, one operational and one a correctness bug:

- **Pools multiply.** Prisma sizes each at `num_cpus × 2 + 1`, so one eight-core
  process can open ~119 connections against a default `max_connections` of 100.
  Pools fill lazily, which is why this has not bitten yet — it will appear as
  `too many clients already`, under load, in production, looking like a database
  problem rather than a code one.
- **`$transaction` cannot span two clients.** Any flow needing two domains to
  commit atomically — approve an instructor request *and* flip the role, create
  a user *and* an enrolment — **cannot be made atomic today**. This is the
  argument that forces the change; the pool count is just the symptom that
  surfaces first.

**② `user.controller.ts` bypasses the service layer.** It is **420 lines** —
longer than the other four controllers combined (177) — with **9 direct
`prisma.user.*` calls** and **zero service imports** for data access:

| Controller | LOC | Direct `prisma.` | Service imports |
|---|---|---|---|
| `user.controller.ts` | 420 | **9** | **0** |
| `videoUpload.controller.ts` | 247 | 0 | 3 |
| `course.controller.ts` | 64 | 0 | 1 |
| `instructorRequest.controller.ts` | 42 | 0 | 1 |
| `admin.controller.ts` | 29 | 0 | 1 |

It is almost certainly just the oldest file — auth was built before the
convention settled. The cost is that auth logic is the least testable code in
the service despite being the most security-sensitive.

**③ `services/user.service.ts` is misnamed.** The convention is
`<domain>.service.ts` = that domain's data access, and `course.service.ts` is
the model. `user.service.ts` is **not that** — it is a 144-line token/crypto
toolkit: `createActivationToken`, `verifyToken`, `encryptedPassword`,
`verifyPassword`, `hashToken`, `generateAccessToken`, `generateTokens`,
`verifyAccessToken`, `verifyRefreshToken`.

So the one file whose name promises user data access contains none of it, and
the controller that needs it reaches past the layer to Prisma. **② and ③ are the
same defect seen from two sides.**

Related: session state lives in `User.extended.session` and is written in two
layers — `generateTokens` (`user.service.ts:110`) persists it, `logoutUser`
(`user.controller.ts:403`) clears it by hand. The JSON shape is spelled out
twice.

---

## 6. Decision — no repository layer

**Recommendation: do not add one.**

- **Prisma's client already is the abstraction** — a generated, fully typed
  data-access layer. Hand-written repositories mostly re-export it with worse
  types: Prisma's `select`/`include` generics narrow the return type per call
  site, and a repository signature must either erase that or reproduce it with
  heavy generic plumbing.
- **The `notification-service` comparison is misleading.** It "has
  repositories" because Spring Data *generates* them from an interface
  declaration at zero cost. Hand-rolling the equivalent in TypeScript is a
  different trade entirely.
- **`services/` already is the seam.** After Phases 1–3 they are the only
  modules importing Prisma — which is the isolation a repository layer would
  buy. The boundary exists; it just is not enforced.
- **It fixes neither real defect.** Adding ~8 files while §5.1 ① and ② stand is
  motion, not progress.

**Enforce the seam with a lint rule instead of a layer** (§13).

**Revisit when** any of these becomes true: read caching in front of Postgres;
reads served from a second source (a Redis projection, a search index); a
serious move off Prisma; or a service file past ~400 lines where query
composition is the bulk of it.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Behaviour drift in auth while moving 9 call sites | `tests/integration/auth.routes.test.ts` and `tests/unit/user.service.test.ts` must pass **unchanged** except for the import rename. Any assertion edit means behaviour changed — stop and review |
| Test mocking breaks | **It does not.** `__mocks__/@prisma/client.ts` returns *the same* `mockDeep()` for every `new PrismaClient()`, so a module singleton receives that identical object. Tests doing `const prisma: any = new PrismaClient()` keep working untouched. Verified by reading the mock |
| Rename churn | 6 importers of `user.service`, 5 of them tests. One `sed`, one run |
| `$transaction` semantics change | Nothing today uses cross-service transactions; the singleton only *enables* them. No migration needed |
| Phase 3 touches the security-critical path | It is the one phase with real risk, so it ships alone, and the gate is the integration suite passing with zero assertion edits plus a manual register→verify→login→refresh→me→logout run |

---

# Part II — LLD

## 8. API surface

All routes mount under `/api/v1` in `app.ts`.

### 8.1 Users — `/api/v1/users`

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/register` | — | Joi `registerUserSchema`; emails an OTP. **5 req/15 min** |
| `POST`/`GET` | `/verify` | verification token | token from `X-Verification-Token`/`X-Token`, query, or cookie; sets `isVerified` |
| `GET` | `/reverify-email` | — | resend |
| `POST` | `/login` | — | **5 req/15 min** |
| `POST` | `/refresh-token` | refresh cookie or body | rotates; re-reads `role`, so a role change lands here |
| `GET` | `/me` | user | strips `password` and `extended` |
| `GET` | `/logout` | user | clears the cookie and `extended.session` |

### 8.2 Courses — `/api/v1/courses`

| Method | Path | Auth |
|---|---|---|
| `GET` | `/` | user |
| `GET` | `/mine` | `INSTRUCTOR` |
| `POST` | `/` | `INSTRUCTOR` |
| `GET` | `/:courseId` | user |
| `PATCH` | `/:courseId` | owner |
| `DELETE` | `/:courseId` | owner |
| `POST` | `/:courseId/enroll` | user — **meaning changes in commerce Phase 2** |

**That last row is the one cross-service change this service owes commerce.**
It becomes an `INSTRUCTOR`/`ADMIN` grant endpoint (`source = ADMIN_GRANT`);
students go through orders, including for free courses, so there is one
enrolment path and one audit trail. A student hitting it gets `402` with
`{ requiresOrder: true, courseId }` so the frontend can redirect rather than
guess.

### 8.3 Video intake — `/api/v1/video-upload`

| Method | Path | Auth |
|---|---|---|
| `POST` | `/presign` | `INSTRUCTOR` + `requireCourseOwner` |
| `POST` | `/` | `INSTRUCTOR` + `requireCourseOwner` — saves `Video` (`UPLOADED`), publishes `video.uploaded` |
| `POST` | `/:videoId/processed` | **`X-Transcoder-Api-Key`** — sets `TRANSCODING`/`READY`/`FAILED` + `hlsMasterPath`; optional `duration` + `resolutions` (with `READY`) and `errorCode` (with `FAILED`, kept in `metadata` beside `error`), each dropped rather than rejected if malformed; `404` for a video that no longer exists |
| `GET` | `/:videoId` | user |
| `PATCH` | `/:videoId` | `INSTRUCTOR` |
| `DELETE` | `/:videoId` | `INSTRUCTOR` — removes the S3 artefacts too |
| `POST` | `/generate-presigned-url` | `INSTRUCTOR` — **legacy**, superseded by `/presign` |

The legacy route is marked `// Legacy` in the source and should be deleted once
the frontend is confirmed not to call it — Phase 4.

### 8.4 Instructor requests and admin

`POST /instructor-requests`, `GET /instructor-requests/me` for users.
`/api/v1/admin/*` applies `isAuthenticated, authorizedRoles('ADMIN')` at the
router level — the right place, so no admin handler can forget it: list and
approve/reject instructor requests, list users, `PATCH /users/:id/role`.

### 8.5 Internal — `/api/v1/internal`

Every route behind `middleware/internalAuth.ts` (`X-Internal-Api-Key`, or
`Authorization: Bearer <key>`, checked against `INTERNAL_API_KEY`). No user
session is involved; a browser cookie will not get you in.

**`GET /courses/:courseId`**

```json
{ "success": true,
  "course": { "id": "clx…", "title": "…", "price": 499.0, "currency": "INR",
              "isPublished": true, "instructorId": "clx…", "amountMinor": 49900 } }
```

`amountMinor` is computed here by `utils/money.ts` so **no caller ever sees a
float**. That — not the column type — was the actual requirement
(`../DATABASE_DESIGN.md` §5).

**`GET /enrollments/:userId/:courseId`** → `{ enrolled, enrollment }`. A row
with `revokedAt` set reads as **not** enrolled, so a refunded buyer can buy
again; the row is still returned so the caller can explain why. This is how
`order-service` blocks someone buying a course they already own — the one
duplicate no unique index can catch, since the previous order is `PAID` and
therefore outside its partial index.

### 8.6 Error contract

| Class | HTTP |
|---|---|
| validation | 400 |
| unauthenticated / bad token | 401 |
| wrong role, not the owner | 403 |
| unknown resource | 404 |
| already enrolled, duplicate email | 409 |
| needs an order | 402 |
| unexpected | 500 |

`catchAsyncError` wraps every handler; `ErrorHandler` carries the status;
`ErrorMiddleWare` renders. Nothing else writes an error response.

---

## 9. `utils/prisma.ts` (new)

```ts
import { PrismaClient } from '@prisma/client';

// One client per process: each PrismaClient opens its own pool
// (num_cpus * 2 + 1), so several would exhaust Postgres under load
// and could not share a transaction.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export const connectDB = async (): Promise<void> => {
  await prisma.$connect();
};

export const disconnectDB = async (): Promise<void> => {
  await prisma.$disconnect();
};
```

`utils/db.ts` is deleted. `index.ts` imports `connectDB` from `utils/prisma`,
**awaits** it, and registers `SIGTERM`/`SIGINT` → `disconnectDB()` — so
`index.ts:7` starts meaning something.

### 9.1 Why not the `globalThis` recipe

The standard Next.js pattern caches the client on `globalThis` to survive HMR
re-evaluating the module. **Not applicable here:** `ts-node-dev --respawn`
restarts the whole process rather than hot-swapping modules, so there is nothing
to leak across. Adding it would be cargo-cult. Node's module cache already gives
one instance per process — the same approach
`video-transcoder/src/services/db.service.ts:6` already takes.

### 9.2 Migration map

Every file: delete the `PrismaClient` import and the
`const prisma = new PrismaClient()` line; add
`import { prisma } from '../utils/prisma';`. No other edits.

| File | Note |
|---|---|
| `services/user.service.ts` | stays for now; renamed in Phase 2 |
| `services/course.service.ts` | keeps its separate `Prisma` **type** import |
| `services/video.service.ts` | — |
| `services/admin.service.ts` | — |
| `services/instructorRequest.service.ts` | — |
| `controllers/user.controller.ts` | temporary; the import disappears in Phase 3 |
| `middleware/ownership.ts` | temporary; replaced in Phase 4 |
| `utils/db.ts` | **deleted** |
| `index.ts` | `connectDB` from `utils/prisma`, awaited + shutdown hooks |

Type-only `import { Prisma } from '@prisma/client'` stays — it is types, not a
client.

---

## 10. `services/auth.service.ts` (renamed from `user.service.ts`)

`git mv services/user.service.ts services/auth.service.ts`. Contents unchanged
except the Prisma import, **plus** two extracted session helpers so the
`User.extended.session` shape lives in one module:

```ts
/** Writes the hashed refresh token + device onto User.extended.session. */
export const persistSession = async (
  user: Iuser,
  refreshToken: string,
  context: ISessionContext,
): Promise<void>;

/** Clears User.extended.session, preserving the rest of `extended`. */
export const revokeSession = (userId: string): Promise<void>;
```

`generateTokens` calls `persistSession` instead of inlining the update;
`revokeSession` absorbs the hand-rolled clear at `user.controller.ts:399-408`.

Importers to update: `controllers/user.controller.ts:6`,
`tests/unit/user.service.test.ts` → `tests/unit/auth.service.test.ts`, and the
`generateAccessToken` import in three integration tests.

---

## 11. `services/user.service.ts` (new — user data access)

Modelled on `course.service.ts`: thin arrow functions returning Prisma promises.

```ts
export const findUserByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email } });

export const findUserById = (id: string) =>
  prisma.user.findUnique({ where: { id } });

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;   // already hashed by the caller
  avatar?: string;
}

export const createUser = (input: CreateUserInput) =>
  prisma.user.create({
    data: { ...input, role: 'STUDENT', isVerified: false, courses: [] },
  });

export const markUserVerified = (id: string) =>
  prisma.user.update({ where: { id }, data: { isVerified: true } });
```

### 11.1 Call-site mapping — all 9

| `user.controller.ts` | Current | Becomes |
|---|---|---|
| :49 | `findUnique({where:{email}})` | `findUserByEmail(email)` |
| :71 | `create({data:{...}})` | `createUser({...})` |
| :156 | `findUnique({where:{id}})` | `findUserById(id)` |
| :202 | `findUnique({where:{email}})` | `findUserByEmail(email)` |
| :267 | `findUnique({where:{id}})` | `findUserById(decoded.id)` |
| :311 | `findUnique({where:{email}})` | `findUserByEmail(email)` |
| :360 | `findUnique({where:{id}})` | `findUserById(userId)` |
| :399 + :403 | read `extended`, then `update` | `revokeSession(userId)` — **auth.service** |

Wherever `verifyUser` flips `isVerified`, that becomes `markUserVerified`.

**The controller keeps** every policy and HTTP concern unchanged: the
`isMobileApp` branch, cookie options, the `{ password, extended, ...safeUser }`
strip at :366, every `ErrorHandler` status code, every response body.

Expected result: ~420 → ~300 lines, 9 → 0 Prisma references.

---

## 12. `middleware/ownership.ts`

Replace the local client and the inline `course.findUnique` with
`getCourseById(courseId)` from `services/course.service`. The 404/403 logic and
the `req.course` attachment are unchanged.

---

## 13. Lint guard — what makes the seam hold

**ESLint is not configured in `backend/` today** (only `frontend/.eslintrc.json`
exists), so this phase stands it up. Then:

```jsonc
"rules": {
  "no-restricted-imports": ["error", {
    "paths": [{
      "name": "@prisma/client",
      "importNames": ["PrismaClient"],
      "message": "Import { prisma } from utils/prisma — one client per process."
    }]
  }]
}
```

…with an override allowing `PrismaClient` only in `utils/prisma.ts`. Type-only
`Prisma` imports stay legal.

Without this, defect §5.1 ① grows back one file at a time. The rule is the
deliverable, not the cleanup.

---

## 14. Testing

Jest + ts-jest under `tests/`, config in `jest.config.js` / `tsconfig.test.json`.
`@prisma/client` is auto-mocked by the shared deep mock in
`__mocks__/@prisma/client.ts`; AWS SDK v3 via `aws-sdk-client-mock`; `kafkajs`
and `sendMail` via `jest.mock`. Integration tests drive real routes through
`tests/helpers/testApp.ts`, which builds the app **without** the rate limiter.

Current coverage: auth (service/middleware/routes), courses, admin, instructor
requests, s3, kafka, sqs, video, the internal catalogue route, `utils/money`.

**The refactor adds no new test infrastructure. The existing suite is the
regression gate**, and the gate per phase is deliberately specific:

- Phase 1: suite passes with **zero test edits** (the shared-mock property, §7).
- Phase 2: only import-path edits; no assertion changes.
- Phase 3: `auth.routes.test.ts` passes **unchanged** — it drives real routes,
  so it is the proof that register/verify/login/refresh/logout still behave
  identically. Plus a new `tests/unit/user.service.test.ts` for the extracted
  data functions.
- Phase 4: deliberately add `new PrismaClient()` to a controller and confirm
  lint fails.

**`npx prisma generate` must run before `npm test`** or every suite importing a
route fails to compile. It looks like a broken suite and is not one.

---

## 15. Configuration

`app.ts` **hard-exits on startup** if `JWT_SECRET`, `ACCESS_TOKEN_SECRET`,
`REFRESH_TOKEN_SECRET` or `CLIENT_URL` is missing.

| Key | Note |
|---|---|
| `PORT` | default `5000` — §15.1 |
| `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | required |
| `ACCESS_TOKEN_EXPIRY` / `REFRESH_TOKEN_EXPIRY` | `5m` / `7d` |
| `BCRYPT_PEPPER`, `CLIENT_URL` | required |
| `DATABASE_URL` | Postgres, schema `public` |
| `RATE_LIMIT_MAX` | default **1000** per IP per 15 min on `/api/v1` |
| `LOCAL_STACK_DATA_SOURCE`, `LOCALSTACK_ENDPOINT` | `true` → LocalStack, path-style, `test`/`test` |
| `S3_RAW_VIDEO_BUCKET`, `PRESIGNED_URL_EXPIRY` | |
| `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_TOPIC_UPLOADED`, `KAFKA_TOPIC_PARTITIONS` | topic default `video.uploaded`, **3** partitions |
| `SMTP_*` | OTP mail; retires in notification Phase 5 |
| `TRANCODER_API_KEY` | **misspelled consistently** across both services. Match it; do not "fix" it in isolation |
| `INTERNAL_API_KEY` | guards `/api/v1/internal/*`, fails closed |

AWS clients are always built through `config/awsConfig.ts` (`awsClientConfig()`).
Never hand-write an endpoint at a call site.

### 15.1 The port disagreement

`index.ts` uses `PORT || 5000`. `frontend/src/config/env.ts` defaults
`apiBaseUrl` to `http://localhost:5001`, and the README documents `5001`. It
works only because the frontend's env var is usually set. **Pick one and fix
`.env.sample`, the README and `deploy/lms-deployment.yaml` together** — that
manifest currently declares `containerPort: 3000` for this service, which
matches nothing.

---

# Part III — Phases

Each phase leaves the service running and is independently reviewable.

### Phase 0 — commerce prerequisites ✅ shipped
`middleware/internalAuth.ts`, `routes/internal.routes.ts`,
`controllers/internal.controller.ts`, `course.service.ts →
getCourseForCatalogue` + `getEnrollment`, `utils/money.ts`;
`Enrollment.orderId`/`source`/`revokedAt` and `Course.currency` in **both**
Prisma schemas; `INTERNAL_API_KEY` exempted from the rate limiter and added to
`.env.sample`. Tests: `tests/unit/money.test.ts`,
`tests/unit/middleware.internalAuth.test.ts`,
`tests/integration/internal.routes.test.ts`.

> **Verified partially.** The two new unit suites pass (10 tests). The new
> integration suite cannot *compile* without network access to
> `binaries.prisma.sh` for `prisma generate` — the same pre-existing failure
> that takes out `auth.routes`, `course.routes`, `admin.routes` and
> `videoUpload.routes` on a clean checkout. Run `npx prisma generate && npm test`
> on a networked machine to close this out. `tsc --noEmit` reports zero errors
> in any file this phase added.

### Phase 1 — one Prisma client
`utils/prisma.ts`, delete `utils/db.ts`, migrate the 7 files, shutdown hooks in
`index.ts`. Purely mechanical; no logic touched.
**Verify:** `npm test` green with no test edits; boot and hit
`/api/v1/users/me`.
**Why first:** it is the prerequisite for running more than one replica
(`../ARCHITECTURE.md` §6.1) and for any future cross-domain transaction.
**Rollback:** self-contained, revert the commit.

### Phase 2 — `auth.service.ts` rename + session helpers
`git mv`, extract `persistSession`/`revokeSession`, update 6 importers.
**Verify:** `npm test` green with only import-path edits.

### Phase 3 — user data access into `user.service.ts`
Build the new module, rewrite the 9 call sites, delete Prisma from the
controller. **The one phase with real risk** — logic moves across a layer in the
most security-sensitive file.
**Verify:** `auth.routes.test.ts` passes **unchanged**; manual register →
verify → login → refresh → me → logout against local infra.

### Phase 4 — enforcement and cleanup
`ownership.ts` via `course.service`; ESLint in `backend/` with the
`no-restricted-imports` guard; delete the legacy
`POST /video-upload/generate-presigned-url` once the frontend is confirmed clear.
**Verify:** deliberately add `new PrismaClient()` to a controller, confirm lint
fails.

### Phase 5 — controller split
`auth.controller.ts` (register/verify/reverify/login/refresh/logout) +
`user.controller.ts` (me). Deferred to here on purpose: tidier, but it widens a
security-sensitive diff, and it is worth doing only once Phase 3 has proved the
behaviour is pinned by tests.

### Phase 6 — `prisma migrate` cutover — ✅ done 28 Oct 2026
Baseline `0_init` generated from the schema; verified by `migrate deploy` on a scratch database (diff empty), then `migrate resolve --applied 0_init` on the dev database.
Baseline the current schema, `migrate resolve --applied`, switch CI to
`migrate deploy`. Trigger and exact steps in `../DATABASE_DESIGN.md` §8.2.

### Phase 7 — the reduction to `auth-service`
Only after 1–6. Move `Course`/`Enrollment`/`Video`, the internal API and video
intake to `course-service`; `backend/` keeps `User` and auth.
**Blocked on** a `course-service/SYSTEM_DESIGN.md`, and on
`video-transcoder` no longer writing the database
(`../DATABASE_DESIGN.md` §3.2 option A).

### Deferred, recorded so it is not silently re-litigated
A repository layer (§6 — revisit only on a listed trigger). GraphQL. A DI
container. Websockets.

---

## 16. Open questions

1. **Phase 3 scope** — move data access only, leaving the 7 handlers otherwise
   as-is? My preference is yes, with the controller split as Phase 5, so the
   risky diff stays small.
2. **ESLint in Phase 4** — standing it up will surface existing violations
   across the whole service. Start with only `no-restricted-imports`, so the
   diff stays about this standardisation rather than becoming a repo-wide lint
   cleanup?
3. **`markUserVerified`** — inferred from the verify flow; I have not read
   `verifyUser` end to end. Confirm during Phase 3 rather than designing against
   an assumption.
4. **Port `5000` or `5001`?** §15.1. This needs an answer before the manifests
   are worth fixing.
5. **Is `name` added to the access-token claims?** One line in
   `generateAccessToken`; gives every future service a personalised greeting
   with no user lookup. It is your token contract, and
   `notification-service` wants it for the receipt template.
6. **Delete `User.courses String[]`?** Legacy, with `Enrollment` authoritative.
   Cheapest moment is the Phase 6 migration baseline.

---

# Part IV — UI configuration

> **Status: U1–U4 built.** Backend tested (Jest 163/163, 38 of them for this feature); frontend
> logic tested in Node (10/10), components type-checked against stubs only — no browser run.
> Your answers to §20 were taken as the recommendations: scope as §17.1, schema + seed in git
> with live versions in the DB, single-admin publish, owned by `backend/` for now, Monaco.
>
> **Deviations from the text below, both deliberate:**
> - **No `ajv`.** It could not be installed offline, and an untestable dependency on the
>   security boundary was the wrong trade. `utils/uiConfigValidator.ts` implements exactly the
>   JSON Schema keywords the schema uses (`type`, `enum`, `properties`, `required`,
>   `additionalProperties: false`, `items`, `min/maxItems`, `min/maxLength`, `pattern`, local
>   `$ref`) and **refuses to start** if the schema ever uses one it does not implement. The
>   schema file stays standard draft-07, so Monaco reads the same contract. Swap in `ajv` later
>   by replacing one module.
> - **Monaco is self-hosted** from `public/monaco/vs` (copied on `postinstall`), not bundled
>   through webpack and not fetched from a CDN — see `../frontend/SYSTEM_DESIGN.md` §15.5.
>
> **To run it:** `cd backend && npx prisma db push && npx prisma generate` (three new tables),
> start the backend — it seeds v1 on first boot — then `cd frontend && npm install` (pulls
> Monaco and copies it) and open `/admin/ui-config` as an admin.

A config-driven UI: admins change what the frontend shows — branding, theme,
navigation, home-page copy, feature toggles, an announcement banner — from an
admin-only screen that looks and behaves like VS Code's diff editor, **without a
redeploy**. This part owns the storage, the schema and the API contract. The
editor and the consumption side are in `../frontend/SYSTEM_DESIGN.md` Part IV.

## 17. HLD

### 17.1 Purpose — and what it is explicitly not

| In scope | Not in scope, on purpose |
|---|---|
| Presentation the business wants to change without engineers: app name, logo, tagline, theme colours, sidebar items (label, order, icon, visibility, roles), home hero and section toggles, empty-state copy, an announcement banner | **Business rules.** Prices, who may buy, roles, limits. A UI flag can *hide* the Buy button; it can never *stop* a purchase — order-service still decides. Anything that must be enforced belongs server-side |
| **Feature toggles that change only what is shown** (`purchases`, `instructorRequests`, `studyProgress`) | Per-user preferences (dark mode for one user) |
| Versioned history, diff, publish, rollback, an audit trail of who changed what | **Executable content.** No JS, no HTML, no CSS strings. Config is data, rendered as text or mapped to a fixed allow-list (icons, section types) |
| | A page builder or CMS. Sections are toggled and ordered, not designed |

### 17.2 "Stored in the DB and in the backend folder" — how the two fit

Your request names both places. They have different jobs, and confusing them is
how config systems drift:

| Where | What lives there | Why |
|---|---|---|
| **`backend/config/ui/` (git)** | `ui-config.schema.json` — the JSON Schema, the *contract*; `ui-config.default.json` — the baseline | Reviewed in pull requests like code. The schema is what both the API and the editor validate against. The default seeds an empty database and is the frontend's last-resort fallback |
| **Postgres `public` (DB)** | Every published version, immutable, plus each admin's draft | Changes without a deploy, which is the whole point; history, rollback and audit come for free from append-only rows |

The live value is **always the database's published version**. Git holds the
*shape* (schema) and a *seed* (default). An export script
(`npm run ui-config:export`) writes the current published version back to
`ui-config.default.json`, so the repository default can be refreshed through a
normal PR instead of rotting. Nothing at runtime ever writes into the
repository folder — a server writing to its own source tree breaks in any real
deployment and is not an audit trail.

### 17.3 Where it sits

```
  admin browser ─▶ /admin/ui-config (frontend, ADMIN only)
                         │  Monaco diff editor: published ↔ draft
                         ▼
  backend  /api/v1/admin/ui-config/*   isAuthenticated + ADMIN
     │        draft · validate · publish · history · rollback
     ▼
  Postgres public: UiConfigVersion (append-only) · UiConfigState (1 row) · UiConfigDraft
     ▲
     │  seed on first boot ◀── backend/config/ui/ui-config.default.json
     │  validate every write ◀── backend/config/ui/ui-config.schema.json
     │
  backend  GET /api/v1/ui-config   public, ETag + Cache-Control: max-age=60
     ▲
  every browser (incl. logged out — the login page needs the brand)
```

No new service and no new infrastructure.

### 17.4 Design decisions

| Decision | Rationale |
|---|---|
| **One JSON document, JSON Schema validated** | One thing to diff, one thing to version, one schema both sides share. Monaco consumes JSON Schema natively, so the editor gets live validation and autocomplete from the same file the API enforces |
| **Immutable versions; publish appends, rollback appends** | Rollback to v7 creates v13 *equal to* v7. History never rewrites, so "what did users see on Tuesday" always has an answer |
| **Draft per admin, server-side** | Survives a closed tab. Two admins editing does not clobber each other's work-in-progress; the conflict surfaces at publish instead |
| **Optimistic concurrency at publish** | A draft records the version it was based on. Publishing against a stale base is `409` with the current version, and the editor re-diffs against it. No locks, no lost updates |
| **Public, cached read** | The login page needs the brand before anyone is logged in. `ETag` = checksum of the version; `max-age=60` bounds how long a publish takes to reach users |
| **Schema forbids unknown keys** (`additionalProperties: false`) | The read endpoint is public, so the document must never become a place to stash a secret. Unknown keys are rejected, not ignored |
| **Allow-lists for anything that becomes UI structure** | `icon` must be a known Lucide name, section `type` a known enum, `href` relative or `https:`. Rules out `javascript:` links and arbitrary components by construction |
| **Owned by `backend/` for now** | It is where the admin role and the users live today. `backend/` is being reduced to `auth-service` (§4), and UI config is not auth — it moves with whichever service ends up owning admin/platform settings. The contract (§18.4) is what the frontend codes against, so the move is a base-URL change. Flagged in §19 |

**Rejected**

| Option | Why not |
|---|---|
| Config only in git, read at build time | Every change is a deploy — the thing this feature exists to avoid |
| Config only in the DB, no file | No reviewed schema, no seed for a fresh stack, no fallback when the API is down |
| A key/value table (one row per setting) | Cannot be diffed as a whole, cannot validate cross-field rules, cannot roll back atomically |
| A headless CMS | A new service and vendor for what is one JSON document |

## 18. LLD

### 18.1 The document (schema v1)

```jsonc
{
  "schemaVersion": 1,
  "branding": {
    "appName": "LearnSphere",
    "tagline": "Learn without limits",
    "logoUrl": null,                 // relative path or https URL; null = text logo
    "supportEmail": "support@learnsphere.dev"
  },
  "theme": {                         // HSL triplets, matching globals.css tokens
    "primary": "83 78% 55%",
    "accent": "83 78% 55%",
    "background": "240 24% 5%",
    "radius": "0.75rem"
  },
  "navigation": {
    "sidebar": [
      { "id": "dashboard", "label": "Dashboard", "icon": "LayoutDashboard",
        "href": "/dashboard", "roles": [], "enabled": true }
      // roles: [] = everyone; ["ADMIN"] = admins only (UX only — routes enforce)
    ]
  },
  "home": {
    "hero": { "title": "…", "subtitle": "…", "ctaLabel": "Get started", "ctaHref": "/signup" },
    "sections": [ { "type": "featuredCourses", "enabled": true, "title": "Popular courses" } ]
  },
  "features": {                      // display only; never a security control
    "purchases": true,
    "instructorRequests": true,
    "studyProgress": true
  },
  "copy": {
    "courseLocked": "Buy this course to watch it.",
    "emptyCatalogue": "No published courses yet. Check back soon."
  },
  "announcement": { "enabled": false, "message": "", "tone": "info", "href": null }
}
```

Schema rules beyond types: `additionalProperties: false` everywhere; strings
capped (labels 40, copy 280); `sidebar` ≤ 12 items with unique `id`s; `icon` ∈
the allow-list in the schema; `href` matches `^/` or `^https://`; HSL values
match `^\d{1,3} \d{1,3}% \d{1,3}%$`; whole document ≤ 64 KB.

**Schema evolution.** `schemaVersion` bumps on a breaking change, with a
migration function `migrate(v1) → v2` in `config/ui/migrations.ts` applied on
read and on seed. Additive changes (a new optional key with a default) do not
bump it.

### 18.2 Files

```
backend/
├── config/ui/
│   ├── ui-config.schema.json      the contract (also served to the editor)
│   ├── ui-config.default.json     seed + fallback
│   └── migrations.ts              schemaVersion upgrades
├── services/uiConfig.service.ts   read/publish/draft/rollback + in-process cache
├── controllers/uiConfig.controller.ts
├── routes/uiConfig.routes.ts      public read + /admin/ui-config/*
├── utils/uiConfigValidator.ts     ajv compile of the schema → { ok, problems[] }
└── scripts/exportUiConfig.ts      npm run ui-config:export
```

New dependency: **`ajv`** (+ `ajv-formats`) — the standard JSON Schema
validator. Joi cannot consume the JSON Schema file, and two schemas (Joi for
the API, JSON Schema for the editor) would drift.

### 18.3 Data model (Prisma, `public`)

```prisma
model UiConfigVersion {
  id            String   @id @default(cuid())
  version       Int      @unique            // 1, 2, 3 … never reused
  config        Json
  schemaVersion Int
  checksum      String                      // sha256 of canonical JSON; the ETag
  message       String                      // "commit message", required
  basedOn       Int?                        // version the draft started from
  rollbackOf    Int?                        // set when this version restores an older one
  createdById   String
  createdAt     DateTime @default(now())
  createdBy     User     @relation(fields: [createdById], references: [id])
}

model UiConfigState {                       // exactly one row, id = "ui"
  id               String   @id @default("ui")
  publishedVersion Int
  updatedAt        DateTime @updatedAt
}

model UiConfigDraft {
  authorId    String   @id                  // one draft per admin
  baseVersion Int
  config      Json                          // may be invalid; publish requires valid
  updatedAt   DateTime @updatedAt
  author      User     @relation(fields: [authorId], references: [id])
}
```

`UiConfigVersion` is append-only: the service never updates or deletes a row.
It is the audit log. Ownership: `backend/` is the only writer
(`../DATABASE_DESIGN.md` §2).

**Publish** is one transaction:
`UPDATE "UiConfigState" SET publishedVersion = N+1 WHERE publishedVersion = :base`
— zero rows updated means a stale base → `409`. Otherwise insert version N+1,
delete the author's draft, commit, then drop the in-process cache.

### 18.4 API contract

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/ui-config` | **public** | the published document + `{ version, checksum }`. `ETag`, `Cache-Control: public, max-age=60, stale-while-revalidate=300`; `304` on `If-None-Match` |
| `GET` | `/api/v1/admin/ui-config` | ADMIN | published version + meta, and the caller's draft if any |
| `GET` | `/api/v1/admin/ui-config/schema` | ADMIN | the JSON Schema, for the editor |
| `GET` | `/api/v1/admin/ui-config/versions?page=` | ADMIN | history: `version, message, createdBy{name}, createdAt, rollbackOf` |
| `GET` | `/api/v1/admin/ui-config/versions/:version` | ADMIN | one version's document (for compare) |
| `PUT` | `/api/v1/admin/ui-config/draft` | ADMIN | `{ baseVersion, config }` → saves even if invalid, returns `{ problems[] }` |
| `DELETE` | `/api/v1/admin/ui-config/draft` | ADMIN | discard |
| `POST` | `/api/v1/admin/ui-config/validate` | ADMIN | `{ config }` → `{ ok, problems: [{ path, message }] }` |
| `POST` | `/api/v1/admin/ui-config/publish` | ADMIN | `{ baseVersion, message }` publishes the caller's draft → `201 { version }` |
| `POST` | `/api/v1/admin/ui-config/rollback` | ADMIN | `{ toVersion, message }` → `201 { version }` (a new version equal to the old one) |

Errors use the existing `{ success, message }` shape plus details:
`400 { problems }` invalid document · `409 { currentVersion }` stale base ·
`413` over 64 KB · `403` non-admin.

**Admin-only, enforced here.** The admin routes use
`isAuthenticated, authorizedRoles('ADMIN')` — and because `authorizedRoles`
already lets ADMIN through every check, `'ADMIN'` alone means admins and no one
else. The frontend guard and hidden nav item are UX; this is the control.

### 18.5 Read path, caching, failure

- `getPublished()` serves from an in-process cache keyed by version, refreshed
  on publish and at most every 30 s otherwise (so a second backend replica
  converges within 30 s without pub/sub — §19).
- **If the stored document fails validation** (a bad migration, a hand-edited
  row), the API serves the last valid version and logs `ALERT`. If nothing valid
  exists, it serves `ui-config.default.json`. Users never see a broken UI
  because of config.
- **Seeding:** on boot, if `UiConfigState` is empty, insert version 1 from the
  default file with message `"seeded from config/ui/ui-config.default.json"`.

### 18.6 Testing

Unit: validator (every rule in §18.1, including `javascript:` hrefs, unknown keys,
oversize), canonical checksum stability, migrations. Integration (supertest + the
shared Prisma mock): public read + `304`, every admin route rejects STUDENT and
INSTRUCTOR with `403`, stale-base publish → `409`, rollback creates a new version,
publish of an invalid draft → `400` with problems.

## 19. Phases (UI configuration)

Each phase leaves the app working exactly as today until the next one lands.

| # | Phase | Ships | Verify |
|---|---|---|---|
| **U1** | Contract + storage | schema + default files, Prisma models, validator, service, all routes, seed on boot, export script, tests | `curl /api/v1/ui-config` returns v1; a STUDENT token gets `403` on every admin route; publish with a stale base gets `409` |
| **U2** | Frontend reads config | provider + server fetch + fallback (frontend Part IV); branding, sidebar, announcement and feature toggles driven by config | change a label via the API → the sidebar shows it within 60 s; stop the backend → the UI renders as it does today |
| **U3** | The editor | `/admin/ui-config`: Monaco diff (published ↔ draft), schema validation + autocomplete, Problems panel, save draft, publish with message, history timeline, rollback | edit → diff highlights → publish → v2 in history → rollback to v1 creates v3 |
| **U4** | Preview + compare + theme | live preview pane; compare any two versions; theme tokens applied as CSS variables | change `primary` in the draft → preview recolours before publishing |
| — | **Deferred** | two-person approval, scheduled publish, per-tenant config, pub/sub cache invalidation, A/B variants | — |

## 20. Open questions (UI configuration)

1. **Is §17.1's scope the right v1?** Branding, theme, sidebar, home hero/sections,
   display-only toggles, copy, announcement. Anything you expected that is missing —
   or anything you want *out*?
2. **"Stored in the backend folder"** — §17.2 reads it as *schema + seed in git, live
   versions in the DB, with an export script to sync back*. If you meant the files
   should be the live source (edited by the admin screen and committed), say so: that
   is a different design (git as the database) with a deploy per change.
3. **Single admin publishes, or two-person approval?** v1 is single-admin with a
   required message and full history. Approval is deferred unless you want it now.
4. **Ownership after the split** (§17.4) — keep it in `backend/` until the split, then
   move it with admin/platform settings rather than leaving it in `auth-service`?
5. **Monaco** (`../frontend/SYSTEM_DESIGN.md` Part IV) is ~3 MB, loaded only on the
   admin route. It is VS Code's own editor, which is what makes it *look and behave*
   like VS Code. Acceptable?
