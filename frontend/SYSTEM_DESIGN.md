# Frontend — System Design

Status: **current state verified** against the code. **Target state and the
phase plan are design for review — no code written for them.**
Port `3000`. Next.js 14 App Router · React 18 · Tailwind · axios · hls.js.

Per the root `CLAUDE.md` **Ways of Working** this is the HLD and the LLD for
this service. Implementation waits for your reaction and then proceeds phase by
phase.

Wider context: `../ARCHITECTURE.md` (system boundaries, scaling),
`../DATABASE_DESIGN.md` (data ownership). Service contracts this app consumes
live in `../backend/SYSTEM_DESIGN.md` §8 and
`../order-service/SYSTEM_DESIGN.md` §6.

---

# Part I — HLD

## 1. Purpose and scope

The frontend is **the only thing a human touches**, and it has one architectural
job beyond rendering: **be the single place that knows how to talk to the
platform.** Every URL, every auth rule, every retry lives in one layer so that a
new service — `order-service` next — is an addition to that layer rather than a
change to components.

**In scope.** All UI; client-side route guards; the typed API layer; session
lifecycle as the browser sees it (login, silent refresh, logout); HLS playback;
the upload UX including direct-to-S3 PUT and status polling.

**Explicitly out of scope.** Authorisation decisions (the server decides; the UI
only hides what it was told it cannot have), business rules, money arithmetic,
anything that must be true — a guard in this codebase is a convenience, never a
control.

**Non-goals for now.** i18n, SSR of authenticated pages (§4.2), a global state
library, a design system beyond the shadcn-style primitives, offline support,
PWA install.

---

## 2. Where it sits

```
                       Browser
                          │
   ┌──────────────────────┴───────────────────────────┐
   │  frontend :3000  (Next.js App Router)            │
   │                                                  │
   │  app/            route segments + page shells     │
   │  components/     ui primitives + app composites   │
   │  hooks/          useRequireAuth, useGuestOnly     │
   │  lib/api/        THE boundary: client, endpoints, │
   │                  *.service.ts, barrel            │
   │  lib/player.tsx  hls.js wrapper                   │
   │  config/env.ts   the only reader of process.env   │
   └───┬──────────────────────┬───────────────────┬────┘
       │ axios                │ PUT (presigned)   │ GET HLS
       │ withCredentials      │                   │
       ▼                      ▼                   ▼
   backend :5000           S3 / LocalStack    video-transcoder :7000
   (+ order-service                           (→ CloudFront, target)
    :8086, target)
```

Three different kinds of traffic, which is the thing to hold on to: **JSON to
our APIs, one large PUT straight to object storage, and a long stream of
segments from a CDN.** Only the first goes through the axios client, and that is
deliberate — the other two must never be buffered by our code.

---

## 3. Design decisions and why

| Decision | Rationale |
|---|---|
| **`config/env.ts` is the only module that reads `process.env`** | Next.js inlines `NEXT_PUBLIC_*` at build time, so each must be referenced statically — a dynamic `process.env[key]` lookup silently yields `undefined` in a browser bundle. Centralising it also gives one place that **throws in production** and falls back in dev, so a missing variable is a loud build failure rather than requests to `undefined/api/v1` |
| **One axios instance, `withCredentials: true`** | The access token is an httpOnly cookie, so credentials must travel with every request. One instance means one interceptor, one base URL, one error normaliser |
| **`endpoints.ts` as a central path registry; never a hand-typed URL** | A path appears once. When `/api/v1/courses` moves to `course-service` it is one edit, not a grep |
| **`*.service.ts` wrappers are the only thing components call** | Components never import axios and never see a URL. The boundary is enforceable by review and, after Phase 1, by lint |
| **Single-flight refresh in the interceptor** | A dashboard mounting five requests at once would otherwise fire five `/refresh-token` calls, and rotation means four of them race on a token that has already changed. One shared promise; the rest await it |
| **`NON_REFRESHABLE_PATHS`** | login, register, verify, reverify and refresh itself are exempt, so "wrong password" and "please verify" reach the caller as themselves instead of being swallowed by a refresh attempt |
| **The interceptor does not redirect on failure** | Callers decide. A guest page that legitimately 401s would otherwise reload-loop — the comment in `client.ts` is load-bearing, not decoration |
| **Guards as hooks, not per-page logic** | `useRequireAuth` and `useGuestOnly`. Redirect logic re-implemented inside a page is how one page ends up with a subtly different rule |
| **shadcn-style primitives, copied not installed** | `components/ui/*` are ours to edit. No runtime dependency on a component library's release cycle, and Tailwind stays the single styling mechanism |
| **`hls.js`, with the native branch kept** | Safari plays HLS natively and `hls.js` must not be used there. Deleting that branch is the classic regression — it works everywhere in testing and fails on every iPhone |
| **DB rows carry S3 *keys*; the client resolves URLs** | `lib/playback.ts` is the one place that turns a key into a URL, which is what lets a CDN replace the transcoder origin without touching a component |

### Rejected

| Option | Why not |
|---|---|
| Redux / Zustand / Jotai | There is no cross-screen client state worth a store. Server data is fetched per screen; the only truly global fact is "who am I", which is one `/me` call. Revisit when a cart arrives |
| React Query / SWR | Genuinely tempting, and the right answer **when** polling and cache invalidation multiply — which commerce does (§4.1). Deliberately deferred to a phase with a trigger rather than adopted on taste |
| `fetch` instead of axios | We would reimplement interceptors and single-flight refresh ourselves |
| A second axios instance per service, copy-pasted | Two copies of the refresh logic that drift. Phase 1 makes `client.ts` a factory instead |
| Tokens in `localStorage` | Readable by any injected script. The cookie's CSRF exposure is the better trade |

---

## 4. The two changes coming

### 4.1 A second backend origin

`order-service` means the app talks to two APIs. `client.ts` currently exports
one hard-wired instance.

**Decision: make it a factory.**

```ts
export function createClient(baseURL: string): AxiosInstance
export const apiClient = createClient(env.apiBaseUrl)       // backend
export const orderClient = createClient(env.orderApiBaseUrl) // order-service
```

The interceptor — single-flight refresh, `NON_REFRESHABLE_PATHS`, error
normalisation — is installed by the factory, so both instances share one
implementation. `config/env.ts` gains `NEXT_PUBLIC_ORDER_API_URL`.

**One subtlety that must be got right:** refresh is a `backend` concern. A 401
from `order-service` must trigger a refresh against **`backend`**, then retry
the original `order-service` request. So the factory takes the refresher as a
dependency rather than each instance refreshing against itself — otherwise
`orderClient` would POST `/users/refresh-token` to `:8086`, get a 404, and log
the user out on a recoverable error.

**Cross-origin caveat.** Today the cookie reaches `:8086` because **cookies
ignore port**, so local dev works by accident. Across hosts in production it
will not. The answer is path routing behind one origin in the ingress
(`../ARCHITECTURE.md` §4.1), not a second auth mode in this app — but this app
is where the breakage would show, so it is recorded here too.

### 4.2 Authenticated pages are client-rendered

Every guarded page is a client component that mounts, calls `/me`, and then
renders — so the first paint of a logged-in dashboard is a loading state, and
the App Router's server components are doing nothing for the pages that matter
most.

This is a **correct** choice today and should be named rather than drifted past:
the auth cookie is httpOnly and reachable from a server component, so server
rendering is *possible*, but it would mean a second auth path (server-side
cookie read + server-side fetch) alongside the axios client, and two auth paths
is the thing this layer exists to prevent.

**Revisit when** either becomes true: the logged-in first paint is measurably
too slow, or a page needs to be indexable while personalised. Until then,
prefer making the *public* catalogue a server component — that is where SSR pays
and auth is not involved.

---

## 5. Current surface

| Route | Guard | Notes |
|---|---|---|
| `/` | — | home |
| `/login`, `/signup` | `useGuestOnly` | |
| `/verify` | — | OTP entry, `components/ui/otp-input` |
| `/dashboard` | `useRequireAuth` | |
| `/admin` | `useRequireAuth` + role | instructor requests, user roles |
| `/courses/new` | `useRequireAuth` + `INSTRUCTOR` | |
| `/courses/[id]` | `useRequireAuth` | detail + player |
| `/courses/[id]/manage` | owner | upload, video list |

Services: `users`, `courses`, `videos`, `admin` — all barrel-exported from
`lib/api/index.ts`. Components import from `@/lib/api`, never from an
individual service file.

Components: `ui/` holds `button`, `card`, `input`, `label`, `otp-input`;
`components/` holds `app-shell`, `app-header`, `auth-shell`, `brand`,
`course-card`, `role-badge`, `video-upload`. `lib/utils.ts` holds `cn()`.

**Missing for commerce:** `orders.service.ts`, an `orders` block in
`endpoints.ts`, a Buy button, `/orders` history, and the payment-provider
checkout handoff.

---

# Part II — LLD

## 6. The API layer contract

Adding an endpoint is exactly three edits, in this order:

1. the path into `endpoints.ts`;
2. a typed wrapper into the matching `*.service.ts`;
3. the function and its types re-exported from `index.ts`.

If a change to a screen requires touching `client.ts`, something is being
bypassed — stop and reconsider.

| File | Single responsibility |
|---|---|
| `config/env.ts` | read and validate `process.env`; export a frozen typed `env` |
| `lib/api/client.ts` | the axios instance(s), the interceptor, `getApiErrorMessage` |
| `lib/api/endpoints.ts` | every path, with `byId(id)`-style helpers for parameterised ones |
| `lib/api/*.service.ts` | one typed function per endpoint, returning domain types |
| `lib/api/index.ts` | barrel |

## 7. Session lifecycle

```
  login ──▶ backend sets httpOnly access + refresh cookies
     │
     ▼
  request ──401──▶ interceptor:  non-refreshable path? ──yes──▶ reject to caller
     │                                 │no
     │                                 ▼
     │                        refreshSession()  ← single-flight, one shared promise
     │                                 │
     │                     success ────┴──── failure
     │                        │                 │
     │                 retry original      reject; the CALLER decides
     │                   (_retried=true)    (no redirect here — §3)
     ▼
  logout ──▶ backend clears the cookie and User.extended.session
```

`_retried` on the request config guarantees **at most one** retry per request,
so a persistently-401ing endpoint cannot become an infinite loop.

### 7.1 The gap worth naming

A refresh failure rejects to the caller, and each caller handles it
independently. There is no single place that observes "the session is gone" and
clears whatever the UI believes about the current user. Today that is survivable
because there is no client-side user cache. **It stops being survivable the
moment one is introduced**, which Phase 3 (a `useSession` hook) would do — so
that phase has to ship the invalidation with it, not after.

## 8. Upload and playback

### 8.1 Upload — three legs, one of which must not touch our code

```
  POST /video-upload/presign   { courseId, fileName, mimeType }
      ← { uploadUrl, videoId }
  PUT  uploadUrl               the raw File, straight to S3
  POST /video-upload           { videoId, courseId, title, … }  → status UPLOADED
  GET  /video-upload/{videoId} poll until READY | FAILED
```

The PUT uses a bare `fetch`/`XMLHttpRequest` against the presigned URL — **not
the axios instance** — because `withCredentials` and our JSON `Content-Type`
must not be attached to an S3 request, and because progress reporting needs the
`XMLHttpRequest` upload events.

**Polling.** `UPLOADED → TRANSCODING → READY | FAILED`, and transcoding a long
video is minutes, not seconds. The rule: **poll with backoff, cap it, and then
say something honest.** A spinner that never resolves generates a support
email; "still processing, we will email you" does not. There is no push channel
for this yet — when `notification-service` Phase 2 lands, a `video.ready` push
replaces the tail of the polling rather than the whole of it.

### 8.2 Playback

`lib/playback.ts` resolves a `hlsMasterPath` into a URL, and `lib/player.tsx`
wraps `hls.js` with the native-HLS branch for Safari.

Today the master playlist is fetched from the transcoder's
`/api/video-transcoder/hls/{videoId}/master.m3u8`, and relative URIs inside the
playlist resolve under that same base — which is exactly the property that lets
a CDN be mounted at that prefix with **no change to any playlist and no change
to any stored row**. When CloudFront lands (`../ARCHITECTURE.md` §4.1),
`playback.ts` is the only file that changes.

`masterPlaylistUrl` currently falls back to a bare `master.m3u8` when
`hlsMasterPath` is empty. That hides a `FAILED` or still-transcoding video
behind a 404 from the player instead of a message from the UI; the caller should
branch on `status` before asking for a URL at all.

## 9. Error handling and UX states

`getApiErrorMessage` is the single way to turn a caught error into UI text:
backend `message`, then the axios message, then a generic fallback. Rendering
`error.message` directly leaks axios internals like `"Request failed with status
code 409"` into the UI.

Every data-driven screen owes four states, and the ones that get skipped are the
last two:

| State | Requirement |
|---|---|
| loading | skeleton or spinner, never a blank frame |
| empty | says what to do next, not just "no results" |
| error | `getApiErrorMessage` + a retry affordance |
| partial | a `READY` video next to a `TRANSCODING` one must both render sensibly |

## 10. Configuration

| Key | Default (dev) | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:5001` | **disagrees with the backend's `5000`** — §12.1 |
| `NEXT_PUBLIC_TRANSCODER_URL` | `http://localhost:7070` | **disagrees with the transcoder's `7000`** — §12.1 |
| `NEXT_PUBLIC_ORDER_API_URL` | *(Phase 2)* | |

`readEnv` throws in production and warns-with-fallback in development, logging
server-side only to keep the browser console clean. Keep that asymmetry: a
missing variable in CI must fail the build, and a missing variable on a laptop
must not block work.

## 11. Testing

**There are no tests in this service.** That is the honest state, and the
proposal is deliberately small rather than a testing strategy nobody adopts:

| Level | What, and why this and not more |
|---|---|
| Unit | `config/env.ts` (throws in prod, falls back in dev), `lib/playback.ts` (URL resolution, including the empty-path case), `getApiErrorMessage` | pure functions, no setup, immediate value |
| Interceptor | single-flight refresh — **five concurrent 401s produce exactly one `/refresh-token`** — plus `NON_REFRESHABLE_PATHS` passthrough and the one-retry cap, with `axios-mock-adapter` | the only genuinely subtle logic in the app, and the most expensive to get wrong |
| Component | `video-upload` state machine and `otp-input` keyboard behaviour, React Testing Library | both have real state |
| E2E | one Playwright happy path: signup → verify → login → browse → enrol → play | the thing that catches an integration break |

Vitest + RTL rather than Jest: no Babel configuration against Next 14, and it
reads the same `@/` alias from `tsconfig`. **Phase 1 ships the interceptor test
with the factory change**, because that is the change most able to break session
handling silently.

## 12. Known issues

| Issue | Detail |
|---|---|
| **Port disagreements** | §12.1 |
| `masterPlaylistUrl` fallback | returns a URL for a video that has none, turning a UI state into a player 404 — §8.2 |
| No client-side `/me` cache | every guarded page refetches. Correct today, wrong once screens multiply — Phase 3 |
| `NEXT_PUBLIC_*` are build-time | a container image is bound to its environment's URLs. Either build per environment or move to a runtime-config endpoint — decide at P5, not now |
| No bundle budget | `hls.js` is not small and nothing watches the bundle |

### 12.1 The port disagreements

`env.ts` defaults to `:5001` for the API and `:7070` for the transcoder. The
backend defaults to `5000` (`backend/index.ts:14`) and the transcoder to `7000`
(`video-transcoder/src/index.ts`). It works only because the env vars are
usually set, which is the worst kind of working. Fix `.env.sample`, this file's
defaults, the README and `deploy/lms-deployment.yaml` **in one change** —
`../ARCHITECTURE.md` §9 tracks the decision.

---

# Part III — Phases

Each phase leaves the app running and is independently reviewable.

### Phase 1 — client factory + the first tests
`createClient(baseURL)`; `apiClient` built from it with identical behaviour;
Vitest stood up; the interceptor test (single-flight, non-refreshable
passthrough, one-retry cap).
**Verify:** login → dashboard → refresh-after-expiry works exactly as before;
the new tests pass.
**Why first:** it is a pure refactor of the riskiest code, pinned by the test
that lands with it, and everything in Phase 2 depends on it.

> **Status: factory done, tests not.** `createClient(baseURL)` builds `apiClient` and
> `orderClient`; the single-flight refresh is shared and **always runs against the
> backend**, so a 401 from `:8086` refreshes on `:5001` and retries on `:8086` (§4.1).
> **Vitest was not added:** the machine this was written on had no npm registry access,
> and adding devDependencies without updating `package-lock.json` would break `npm ci`.
> The interceptor test is still owed, first thing on a networked machine.

### Phase 2 — commerce client
`NEXT_PUBLIC_ORDER_API_URL`; `orderClient` via the factory, refreshing against
`backend` (§4.1); `endpoints.orders`; `lib/api/orders.service.ts`; barrel
exports.
**Verify:** `POST /orders` against a running `order-service` returns a typed
order; a deliberately expired access token refreshes and retries once.
**Depends on** `order-service` Phase 1.

> **Status: done.** `NEXT_PUBLIC_ORDER_API_URL` (default `http://localhost:8086`),
> `endpoints.orders` / `endpoints.adminOrders`, `lib/api/orders.service.ts`
> (`ordersApi`, `adminOrdersApi`), barrel exports. `CourseSummary` gained `currency`;
> `coursesApi.enroll` became `coursesApi.grant` (students get `402` from the backend now).

### Phase 3 — the buy flow
Buy button on `/courses/[id]`; provider checkout handoff switching on
`provider` in one component; status polling to `PAID` with an honest timeout
message; then re-fetch the course; `/orders` history.
Ships **with** a `useSession` hook and its invalidation (§7.1) — the two cannot
be separated safely.
**Verify:** a test-mode card buys a course end to end in the browser; killing
the webhook shows the "payment received, unlocking" state and then recovers when
the sweeper does.
**Depends on** `order-service` Phase 4.

> **Status: written; type-checked only against stubs (no React/Next types offline).**
>
> - `components/buy-course.tsx` — one state machine: create (idempotency key held per
>   intent, so a closed modal reopens the *same* order) → Razorpay modal
>   (`lib/razorpay.ts`) / Stripe redirect (`?order=` resumes on return) / dev mock
>   gateway buttons → poll the order → poll the course. Both polls end in an honest
>   message (60 s, then a 5-minute slow phase; 10 s to unlock) — §7.5 of the order design.
>   `409 already enrolled` reloads the course rather than erroring.
> - `lib/money.ts` — `formatPrice` / `formatMinor` by currency. The hard-coded `$` and
>   "USD" are gone: the catalogue is priced in the course's `currency` (INR by default).
> - `app/orders` — purchase history; the sidebar's "Transaction" item now links to it.
>   Admin console gained `components/admin-orders.tsx` (filter, full/partial refund).
> - Dashboard shows "My learning" from `GET /courses/enrolled`.
> - **§7.1 closed without a cache:** `onSessionExpired` fires when a refresh fails and
>   `useRequireAuth` redirects to `/login`. A `useSession` cache was not needed for the
>   buy flow, so it was not introduced; the invalidation hook is ready for when it is.
> - React Query not adopted (§13 Q3) — two polling loops did not justify it.
> - **Owed:** `npm run build` + `npm run lint` on a networked machine; the Playwright
>   happy path from §11.

### Phase 4 — upload UX and S3-backed playback
Progress reporting on the direct PUT; backoff polling with a capped,
honest terminal message; branch on `status` before resolving a playback URL
(§8.2); point `playback.ts` at CloudFront.
**Verify:** upload a real file and watch it reach `READY` and play; a `FAILED`
video shows a message, not a broken player.
**Depends on** P1 of the roadmap (CDN-backed playback).

### Phase 5 — public catalogue as server components
Server-render the unauthenticated catalogue only, where SSR pays and auth is
not involved. Authenticated pages deliberately stay client-rendered (§4.2).

### Phase 6 — push, replacing the tail of polling
Service worker, `getToken()`, `POST /api/v1/devices` after login; a `video.ready`
push shortens the polling loop rather than removing it — polling stays as the
fallback for a denied notification permission.
**Depends on** notification Phase 2.

### Deferred, recorded so it is not silently re-litigated
React Query (trigger: Phase 3 making polling and invalidation multiply beyond
what hooks handle cleanly), a global state store (trigger: a cart), i18n, PWA,
SSR of authenticated pages.

---

## 13. Open questions

1. **Ports `5001`/`7070` or `5000`/`7000`?** §12.1. One answer fixes four files.
2. **Provider checkout: modal or redirect?** Razorpay's JS modal keeps the user
   on our page and makes the "payment received, unlocking" state natural. Stripe
   Checkout redirects, which means the return URL has to re-enter the polling
   state from a cold page load. The `checkout` bag in the API contract already
   supports both — the question is which is the default UX we design for.
   My preference is the modal, with redirect handled as the variant.
3. **React Query in Phase 3 or stay with hooks?** Polling plus
   invalidate-on-paid plus optimistic enrolment is roughly where hand-rolled
   hooks stop being cheaper. I would adopt it *in* Phase 3 rather than before.
4. **Does the buy flow live on `/courses/[id]` or its own `/checkout` route?**
   In-page is fewer states; a route is linkable and survives a reload. Leaning
   in-page for v1 given the modal, but a redirect provider pushes toward a
   route.
5. **Is `/me` cached in a context, and for how long?** Needed for Phase 3, and
   it is the change that makes §7.1 load-bearing.

---

# Part IV — UI configuration

> **Status: built (U2–U4); not run in a browser.** Logic tested in Node (`themeVars`,
> `visibleNav`, the fallback shape check, line-diff stats, changed sections, JSON-pointer →
> line): 10/10. Components type-checked against stubs only — React, Next and Monaco types were
> not available offline. **Owed:** `npm install && npm run build`, then the E2E in §15.6.
> `npm run ui-config:sync` refreshes the bundled fallback from the backend default; a backend
> test fails if they drift.

The consumer and the editor for the config-driven UI. Storage, the schema, the
API contract and the phase plan (U1–U4) live in `../backend/SYSTEM_DESIGN.md`
Part IV — read that first; this part does not restate it.

## 14. Reading the config

### 14.1 Flow

```
app/layout.tsx  (server component)
   │  fetch(GET /api/v1/ui-config, { next: { revalidate: 60 } })
   │     ok ──────▶ published document
   │     fails ───▶ lib/ui-config/defaults.ts  (today's UI, verbatim)
   ▼
<html style={themeVars(config.theme)}>      ← CSS variables, so no flash of the wrong theme
  <UiConfigProvider value={config}>          ← client context
     useUiConfig()  in AppShell, home, dashboard, course page, BuyCourse …
```

**Server-side first, on purpose.** Theme colours applied after hydration would
flash the default palette on every load. Reading in the root layout (a server
component) and emitting the CSS variables on `<html>` means the first paint is
already correct. This is the one place server-side fetching earns its keep and
needs no auth — the read is public (§4.2 still holds for authenticated pages).

**Fallback is today's UI.** `defaults.ts` encodes the current hard-coded
labels, nav and copy exactly. Backend down, or the request failing for any
reason, renders the app as it looks today rather than an error.

### 14.2 Files

```
src/lib/ui-config/
├── types.ts          UiConfig — mirrors the backend schema v1
├── defaults.ts       fallback = today's UI
├── provider.tsx      UiConfigProvider, useUiConfig()
├── theme.ts          themeVars(theme) → { '--primary': '83 78% 55%', … }
└── icons.ts          the Lucide allow-list: name → component (unknown name → no icon)
```

`config/env.ts` stays the only reader of `process.env`; the layout uses
`env.apiBaseUrl`.

### 14.3 What reads it in U2

| Surface | Today | Config-driven |
|---|---|---|
| `components/app-shell.tsx` sidebar | hard-coded `NAV` array | `navigation.sidebar`: order, label, icon, href, `enabled`, `roles` |
| `components/brand.tsx` | "LearnSphere" text | `branding.appName`, `logoUrl` |
| Announcement | — | banner above the header when `announcement.enabled` |
| `components/buy-course.tsx` | always shown | hidden when `features.purchases` is false, with `copy.courseLocked` |
| Dashboard "Become an instructor" card | always shown | `features.instructorRequests` |
| Course page study-progress card | always shown | `features.studyProgress` |
| Home hero | hard-coded copy | `home.hero`, `home.sections` |

**`roles` on a nav item is cosmetic.** Hiding "Admin" from a student is UX; the
route guard and the backend's `ADMIN` check are the controls.

## 15. The editor — `/admin/ui-config`

### 15.1 Access

- Route `app/admin/ui-config/page.tsx`, guarded by `useRequireRole('ADMIN')`.
- Linked only from the admin console and the admin-only sidebar entry ("UI
  Config"), which `app-shell.tsx` adds for `role === 'ADMIN'` — the same pattern
  the existing "Admin" item uses.
- Every call it makes hits `/api/v1/admin/ui-config/*`, which the backend
  rejects with `403` for anyone else. The page being hidden is not the security;
  the API is.

### 15.2 Layout — VS Code's diff editor, in the app's dark palette

```
┌──┬──────────────────────┬────────────────────────────────────────────────────────────────────┐
│≡ │ TIMELINE             │ ● ui-config.json   v12 (published) ↔ Draft          ⇆ Inline  ⋯     │
│  │                      ├──────────────────────────────────┬─────────────────────────────────┤
│⎇ │ ● Draft — unsaved    │  v12 · published (read-only)     │  Draft (editable)                │
│  │   based on v12       │ 12   "sidebar": [                │ 12   "sidebar": [                │
│◷ │                      │ 13     { "id": "dashboard",      │ 13     { "id": "dashboard",      │
│  │ ◉ v12  Published     │ 14 -     "label": "Dashboard",   │ 14 +     "label": "Home",        │  red / green
│⚙ │   "New hero copy"    │ 15       "icon": "Layout…",      │ 15       "icon": "Layout…",      │  line + word
│  │   Asha · 2h ago      │ …                                │ …                                │  highlights
│  │ ○ v11                │                                  │                                  │
│  │   "Announcement on"  │                                  │                                  │
│  │   Ravi · yesterday   ├──────────────────────────────────┴─────────────────────────────────┤
│  │ ○ v10  ↺ rollback    │ PROBLEMS 1   PREVIEW                                                │
│  │        of v8         │ ⚠ navigation.sidebar[3].href  must start with "/" or "https://"   │
├──┴──────────────────────┴────────────────────────────────────────────────────────────────────┤
│ ⎇ v12 → draft · +3 −2 · JSON · Schema v1 · Ln 14, Col 18 · ✓ Saved 4s ago  [Discard] [Publish ▸]│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Region | Behaviour |
|---|---|
| **Activity bar** (far left) | Editor · Timeline · Settings (theme toggle for the editor: dark / high-contrast) |
| **Timeline** | Draft pinned on top, then versions newest-first: number, message, author, relative time, a `Published` badge on the live one, `↺ rollback of vN` where applicable. Click = compare that version with the draft. *Select for compare* on two entries diffs any two versions (U4). Context menu: *Restore this version…* |
| **Diff editor** | Monaco `DiffEditor`: left = base (read-only), right = draft. Side-by-side ⇄ inline toggle, collapsed unchanged regions, word-level highlights, minimap, sticky scroll, F7 / ⇧F7 to jump between changes — VS Code's own behaviour, because it is VS Code's editor |
| **Problems** | Live schema errors from Monaco's JSON language service (instant, as you type) and the server's `/validate` result (authoritative, on save). Click a problem → cursor jumps to the path |
| **Preview** (U4) | The sidebar, brand, announcement and hero rendered from the *draft*, using the real components with the draft passed to `UiConfigProvider` |
| **Status bar** | base → draft, `+added −removed` lines, schema version, cursor, validity, autosave state |
| **Publish** | Dialog: required message, a summary of changed top-level keys, the diff stats, then publish. Disabled while there are problems. On `409`: "Published moved to v13 while you were editing" — re-bases the diff onto v13 and keeps your draft |

### 15.3 Interaction details

- **Autosave**: draft `PUT` debounced 1.5 s after typing stops; `⌘S` / `Ctrl+S` saves
  immediately; status bar shows *Saving… / Saved 4s ago / Offline — retrying*.
- **Leaving with unsaved changes** prompts (`beforeunload`).
- **Format document**: `⇧⌥F` (Monaco's JSON formatter); canonical key order is not
  forced, so diffs stay what the admin typed.
- **Autocomplete + hover docs** come from the schema served at
  `/admin/ui-config/schema`, registered with
  `monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ schemas })`.
- **Theme**: a custom Monaco theme, `learnsphere-dark`, built from the app's CSS
  tokens (background `240 24% 5%`, lime accents for the gutter and selection,
  GitHub-style red/green diff colours tuned for contrast on the dark ground).
- **Keyboard and screen readers**: Monaco's built-in accessibility mode; timeline is a
  listbox with arrow-key navigation; every action has a button, not only a shortcut.

### 15.4 Component layout

```
src/app/admin/ui-config/page.tsx          guard + data loading
src/components/ui-config/
├── config-workbench.tsx                  the grid: activity bar, timeline, editor, panel, status bar
├── config-diff-editor.tsx                Monaco DiffEditor, next/dynamic({ ssr: false })
├── version-timeline.tsx
├── problems-panel.tsx
├── config-preview.tsx                    (U4)
├── publish-dialog.tsx
└── status-bar.tsx
src/lib/api/uiConfig.service.ts           uiConfigApi + adminUiConfigApi (endpoints.ts gains both blocks)
```

### 15.5 Dependency — Monaco

`@monaco-editor/react` + `monaco-editor`. **As built:** `scripts/copy-monaco.mjs`
(`postinstall`) copies `monaco-editor/min/vs` into `public/monaco/vs` (gitignored), and the
editor uses `loader.config({ paths: { vs: '/monaco/vs' } })`. That keeps the original goal —
no third-party script on an admin page, works offline — while avoiding the fragile part of
bundling Monaco through webpack: its web workers. Loaded with `next/dynamic` on the admin route only, so it never touches
the student bundle. It is a few MB, paid once on the first visit to the editor and cached after.

**Rejected:** `react-diff-viewer` — light, but read-only; a diff you cannot edit in
place is not "like VS Code". CodeMirror 6 merge view — editable and lighter, but it
does not look or behave like VS Code, which is the explicit ask.

### 15.6 Testing

Unit: `themeVars`, `icons` allow-list fallback, the provider's fallback to defaults.
Component: workbench states — clean, dirty, invalid (publish disabled), `409`
rebase. E2E (Playwright): admin edits a sidebar label → publishes → the sidebar
shows it after reload; a student visiting `/admin/ui-config` is redirected, and its
API calls return `403`.

---

# Part V — The video player

> **Status: agreed.** Visual reference: the current YouTube player — a thin full-width progress
> bar, and below it separate translucent **pill groups**: `▶` · `⏮ ⏭` · volume · `0:00 / 0:57`
> on the left, one pill holding captions · settings · theater · fullscreen on the right. Accent
> colour is the UI config's `primary`. **The player takes the video's own shape**: a 9:16 lesson is
> shown as a tall 9:16 player (centred, height-capped), never letter-boxed into 16:9.

## 16. HLD

### 16.1 What is wrong today

`lib/player.tsx` is the browser's **native** `<video controls>` with two additions: a gear in the
top-right corner and a *second* quality dropdown below the video. The result:

- **It looks different in every browser.** Chrome, Firefox and Safari each draw their own
  control bar, and none of them match the app's dark, lime-accented look.
- **Quality appears twice**, and the gear sits over the picture, away from the controls.
- **There is no playback speed** — the control a learner uses most after play.
- **There are no keyboard shortcuts, no theater mode, no resume, no "next lesson".** These are
  what make a course feel like a course rather than a folder of files.
- **Errors leak raw hls.js codes** ("networkError: manifestLoadError").

### 16.2 Goal — YouTube's interaction model, in LearnSphere's palette

The goal is to copy what YouTube gets right: the layout, the behaviour and the shortcuts
people already know. It is not to copy its branding. The accent colour is the UI config's
`primary`, not YouTube red, so the player follows a theme change made in `/admin/ui-config`.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                  (video)            ◀◀ 10      (double-tap   │
│                     ▶  big play on first load    ripple)     │
│                                                              │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●░░░░░░░░░░░░···························  4:12 │ ← hover: grows, knob, time tooltip
│ ▶  ⏭  🔊━━━○   1:23 / 10:45            ⚙  ⧉  ▭  ⛶            │ ← bottom gradient, auto-hides
└──────────────────────────────────────────────────────────────┘
  play next volume  time                settings PiP theater fullscreen
```

| Area | Behaviour |
|---|---|
| **Progress bar** | Shows played (accent), buffered (white/40) and remaining (white/20). On hover it grows from 3px to 5px, shows a knob and a time tooltip that follows the cursor. Click or drag to seek; on touch, drag with the pointer captured. It is a keyboard-focusable `role="slider"`. |
| **Controls** | Left: play/pause, next lesson, volume (a mute button; the slider slides out on hover), `1:23 / 10:45`. Right: settings, picture-in-picture, theater, fullscreen. Every button has a tooltip naming its shortcut, e.g. "Pause (k)". |
| **Auto-hide** | Controls and cursor hide after 2.5s without movement while playing. They always show when paused, while a menu is open, and while keyboard focus is inside the controls. |
| **Settings menu** | YouTube-style two-level popover: *Playback speed* (0.25–2×, default *Normal*) and *Quality* (*Auto · 720p*, then the levels high → low). Each submenu has a back arrow. On Safari's native-HLS branch Quality is hidden, because native HLS chooses quality itself. |
| **Centre feedback** | A large play button before the first play. A brief play/pause pulse on toggle. A "◀◀ 10 s" / "10 s ▶▶" ripple on a seek. A spinner only while `waiting` lasts more than 300ms, so it never flickers. |
| **Theater mode** | The player spans the content width and the lesson list moves below it; this is the course page's layout, owned by the page. |
| **End of lesson** | An "Up next" card with the next lesson's title and a 5s countdown ring, plus *Cancel* and *Play now*. |
| **Resume** | Reopening a lesson offers "Resume from 4:12", and starts there. |
| **Errors** | "This video can't be played right now", with *Try again*. The hls.js detail goes to the console, not the user. Network errors retry once by themselves (`hls.startLoad()`). |

**Keyboard shortcuts** — the YouTube set. They are active when the player or the page body has
focus, and **never while typing in an input**.

| Key | Action |
|---|---|
| Space / K | play / pause |
| J / L | back / forward 10s |
| ← / → | back / forward 5s |
| ↑ / ↓ | volume ±5% |
| M | mute |
| F | fullscreen |
| T | theater |
| I | picture-in-picture |
| 0–9 | jump to 0–90% |
| Shift + . / Shift + , | speed up / down |
| Home / End | jump to start / end |

**Touch:** a tap toggles the controls; a double-tap on the left or right third seeks ∓10s.

### 16.3 Decisions

- **Build it on the existing hls.js, without a player framework.** The custom layer is roughly
  600 lines across small files. It matches the app's components exactly and adds no
  dependency.
  - *Rejected:* **Vidstack** — the strongest off-the-shelf option, but large, with its own
    theming system to fight.
  - *Rejected:* **video.js / Plyr** — older styling models, and a second stylesheet.
- **Keep the native-HLS branch for Safari.** On iOS, fullscreen hands over to the system
  player, which is correct and expected there.
- **Per-viewer preferences live in `localStorage`, read and written under try/catch.** That
  covers volume, muted, speed, quality, theater, and the resume position per `videoId`. These
  are conveniences: losing them in a private window is fine.
- **Server-side progress is out of scope.** "Continue where you left off on another device" and
  the course page's completion points need a progress table owned by the catalogue. That is a
  backend feature with its own design.

## 17. LLD

```
components/player/
  video-player.tsx        public component; composes everything below
  use-hls.ts              attach/detach hls.js or native; levels, activeLevel, setLevel, fatal error, retry
  use-media.ts            play/pause, currentTime (rAF while playing), duration, buffered, volume,
                          muted, rate, waiting — from media events; actions: toggle, seek, setVolume…
  use-idle.ts             auto-hide timer (pointer move / key / focus within resets it)
  use-shortcuts.ts        the key map above; ignores events from inputs/textareas/contenteditable
  progress-bar.tsx        played/buffered/hover layers, tooltip, pointer-capture drag, role=slider
  control-bar.tsx         the two button rows
  volume-control.tsx
  settings-menu.tsx       two-level popover (speed, quality)
  center-feedback.tsx     big play, toggle pulse, seek ripple, buffering spinner
  up-next.tsx             countdown card
  prefs.ts                typed localStorage access, every call in try/catch
  time.ts                 formatTime(seconds) → "1:23" / "1:02:03"
```

```ts
interface VideoPlayerProps {
  src: string;                       // master playlist
  videoId: string;                   // resume + prefs key
  title?: string;                    // shown top-left in fullscreen, as YouTube does
  next?: { title: string; onPlay: () => void };   // enables ⏭ and "Up next"
  theater?: boolean;
  onTheaterChange?: (on: boolean) => void;        // the page owns the layout
  autoPlay?: boolean;                // true when arriving from "Up next"
  className?: string;
}
```

- `lib/player.tsx` keeps exporting `HlsPlayer` as a thin wrapper over `VideoPlayer` for one
  release, so the two call sites move independently.
- `courses/[id]/page.tsx` (the learner view) passes `next`, `theater` and `onTheaterChange`.
- `courses/[id]/manage/page.tsx` (instructor preview) uses the bare player.

**Accessibility:**

- Every control is a `<button>` with an `aria-label`.
- The progress bar sets `aria-valuetext="1 minute 23 seconds of 10 minutes 45 seconds"`.
- The settings menu is a `role="menu"` with arrow-key navigation, and Escape closes it.
- Focus rings are visible.
- Under `prefers-reduced-motion`, the pulse and ripple animations are dropped.

## 18. Phases

| Phase | Ships | Verified by |
|---|---|---|
| **P1 — the player** | everything in §16.2 except theater, Up next and resume: custom controls, progress bar, settings (speed + quality), auto-hide, shortcuts, touch, centre feedback, friendly errors; the duplicate quality dropdown goes | `tsc`, `next lint`, `next build`; Vitest units for `formatTime`, the shortcut map and the input guard |
| **P2 — the course page** | theater layout; Up next + autoplay to the next ready lesson; resume position; remembered prefs; the lesson list restyled as a YouTube playlist panel ("Now playing", progress per lesson from local resume data) | build + manual pass in Chrome, Firefox, Safari |
| **P3 — needs the transcoder** *(deferred)* | a poster image and **hover-scrub preview thumbnails**. The transcoder emits a sprite sheet + WebVTT thumbnail track per video, and the progress-bar tooltip shows the frame. This is its own transcoder phase. | — |
| Deferred | captions (no subtitle source exists yet); server-side progress (backend design) | — |

---

# Part VI — Course Studio: building and previewing a course

> **Status: agreed** — order S1 → S2 → player (Part V) → S3 → S4; hard-coded learner-page
> content removed; single-file upload until S4.

## 19. HLD

### 19.1 Who this is for, and what they are trying to do

An **instructor** (or an admin acting for one) builds a course and wants to answer three questions
quickly: *What's in it? Does it look right to a student? Is it ready to sell?* Today the page
answers none of them well:

| Today | Why it hurts |
|---|---|
| Upload is a permanent side card with a raw `<input type=file>` and an "Upload another" reset | It is the largest thing on the page and the least-used; it looks unfinished |
| "Preview" is a mini player that expands **inside the lesson row** | The instructor never sees the course *as a student sees it* — the price, the lesson list, the player in context |
| No route from the studio to the learner page at all | The backend already lets the owner and admins watch (`canAccessVideos = isOwner \|\| isAdmin \|\| enrolled`); the UI never takes them there |
| `window.confirm()` for deletes; editing the course replaces the whole header inline | Browser-native dialogs break the product's look; inline swap loses context |
| **Publish works with zero ready lessons** | A student can buy an empty course |
| Lessons ordered by upload time, no reordering | Upload order is rarely teaching order |
| The learner page shows **hard-coded** "Suitable for" bullets, progress points and "Mentor · Course Instructor" on every course | Fake content an instructor sees on their own course and cannot change |
| Admins cannot find another instructor's draft course | Support cannot look at what a creator is complaining about |

**Not in scope:** sections/modules, quizzes, drafts-vs-published versions of a lesson, analytics.

### 19.2 The journey this designs for

```
Create course ──▶ Studio (empty) ──[+ Add lesson]──▶ Upload modal ──▶ lesson appears "Processing"
                     │                                                        │
                     │◀──────────────────────── becomes "Ready" ◀─────────────┘
                     │
                     ├─[Preview]──▶ learner page, with an "Instructor preview" bar ──[Back to studio]
                     │
                     └─[Publish]──▶ checklist modal (≥1 ready lesson, price, description) ──▶ live in catalogue
```

### 19.3 The Studio page — `/courses/[id]/manage`

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ← My courses                                                                      │
│ Kafka for Beginners                         ● Draft    [👁 Preview] [Publish]  [⋯] │
│ ₹499 · 4 lessons · 1 h 12 min · 0 students                  Edit details · Delete │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Lessons                                                          [ + Add lesson ] │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ ⠿  1  ▕▔▔▔▔▔▔▏ Introduction                     12:04   ● Ready      ▶   ⋯  │ │
│ │ ⠿  2  ▕▔▔▔▔▔▔▏ Producers and partitions         18:30   ● Ready      ▶   ⋯  │ │
│ │ ⠿  3  ▕▔▔▔▔▔▔▏ Consumers                         —      ◌ Processing ▬▬▬    │ │
│ │ ⠿  4  ▕▔▔▔▔▔▔▏ Exactly-once                      —      ✕ Failed  Replace ⋯ │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Header** carries the course's state (`Draft` / `Live`), its key numbers, and the two primary
  actions. Secondary actions (Edit details, Delete) live in a `⋯` menu — destructive actions
  are never a big red button next to Publish.
- **`+ Add lesson`** is the only upload entry point, in the Lessons header; on an empty course it
  is also the centre of a large empty state ("Add your first lesson — MP4, MOV or WebM").
- **Lesson rows:** drag handle, number, a 16:9 thumbnail slot (a branded placeholder until the
  transcoder produces thumbnails), title + description, duration, status, `▶` preview, and a `⋯`
  menu (Edit, Replace video, Delete).
  - `Processing` shows an indeterminate bar and refreshes on its own.
  - `Failed` offers **Replace video** inline — the action that fixes it.
- **`▶` and `Preview` open the learner page** (`/courses/[id]?lesson=<videoId>`), never an inline
  player. One place to watch, the same one students use.

### 19.4 The Add-lesson modal

```
┌ Add a lesson ─────────────────────────────────────────── ✕ ┐
│ ┌────────────────────────────────────────────────────────┐ │
│ │            ⬆  Drag a video here, or browse              │ │
│ │          MP4, MOV, WebM · up to 5 GB                    │ │
│ └────────────────────────────────────────────────────────┘ │
│  ▶ intro-to-kafka.mp4 · 248 MB                    Change   │
│  Title        [ Intro to kafka                          ]  │   ← prefilled from the file name
│  Description  [ optional                                ]  │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░  64% · 1.2 min left              │
│                                   [ Cancel ]  [ Upload ]   │
└────────────────────────────────────────────────────────────┘
```

- Drag-and-drop or browse; non-video files and files over 5 GB are refused **before** upload with
  a reason.
- **Title prefilled** from the file name (`intro-to-kafka.mp4` → "Intro to kafka"), editable.
- Progress with time remaining; **Cancel actually aborts** the upload (today it cannot).
- Closing the modal mid-upload asks "Stop uploading?" — no silent background work in v1.
- On success the modal closes, the lesson is already in the list as `Processing`, and a small
  confirmation reads "Lesson added — it'll be ready to watch in a few minutes".

### 19.5 Instructor preview on the learner page — `/courses/[id]`

When the viewer is the course's instructor or an admin, the learner page shows a slim bar
above everything:

```
┌ 👁 Instructor preview — this is what students see.  ● Draft: not visible in the catalogue yet ┐
│                                                          [ Back to studio ]  [ Publish ]     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- No Buy button for them (already true — they have access). The lesson in `?lesson=` starts
  selected.
- Processing/failed lessons appear in the list as students would *not* see them? **No** — the
  student list shows ready lessons only; the preview shows the same, plus a muted note "2 lessons
  still processing — only ready lessons are shown to students". What the instructor previews is
  exactly what a buyer gets.
- **The hard-coded "Suitable for", progress points and "Mentor · Course Instructor" are removed**
  (question 2): the learner page shows only real course data.

### 19.6 Publish — a checklist, not a toggle

`Publish` opens a short modal: ✓ at least one ready lesson · ✓ description · ✓ price set (or
free) → "Publish course". Unmet items are shown with how to fix them, and the button stays
disabled. The **backend enforces the first rule too** (a `409` when publishing a course with no
`READY` video) — a hidden button is not a rule. Unpublish asks once: "Students who bought it keep
access; new students can't find it."

### 19.6a Setting the price

Today the price is a bare number box: it shows `0` you cannot delete (the edit form stored a
number, so clearing it snapped back to `0` — **hot-fixed already**: both forms now keep the typed
text), scrolling over it changes the value, and `0 = free` is explained only in a placeholder.

```
Price     ( Free | ● Paid )
          ┌───┬──────────────────┐
          │ ₹ │ 499              │      Students pay ₹499.00
          └───┴──────────────────┘
```

- **Free / Paid** segmented control. *Free* hides the amount; *Paid* focuses it. The price is
  never inferred from an empty box.
- Amount is a text field with `inputMode="decimal"` — no spinner arrows, no scroll-wheel changes,
  no `e`; at most two decimals; the currency symbol is a fixed prefix.
- Live preview ("Students pay ₹499.00") with `formatPrice`, so what is typed is what is charged.
- **Rules, enforced in the backend too** (Joi in `createCourseSchema`/`updateCourseSchema`):
  free = exactly 0; paid = **₹1 to ₹5,00,000** — ₹1 is Razorpay's minimum charge, so a ₹0.50 course
  would create orders no gateway can capture. The message says which rule failed.
- Changing the price of a **live** course asks once: "New buyers pay ₹X. Existing students keep
  access." (Open orders keep the price they were created at — order-service snapshots it.)

One `PriceField` component, used by both the create page and the edit-details dialog.

### 19.8 When processing fails — and the notifications around it

A lesson the instructor owns moves through `Uploading` (in the browser) → `Queued` → `Processing`
→ `Ready` | `Failed`. Transient trouble (network, storage) is **already retried automatically**
by the transcoder; what reaches `Failed` is something a person has to act on, so the UI says what
happened and offers exactly the actions that can fix it. The reason comes from the transcoder's
`errorCode`, stored on the video (`metadata.errorCode`) — never a raw FFmpeg string.

| `errorCode` | What the instructor reads | Actions |
|---|---|---|
| `CORRUPT_OR_UNSUPPORTED` | "We couldn't process this file. It may be corrupt or in a format we don't support." | **Replace video** · Delete |
| `SOURCE_MISSING` | "The uploaded file is no longer available. Upload it again." | **Replace video** · Delete |
| `GAVE_UP` | "Processing failed after several attempts." | **Retry processing** · Replace video · Delete |
| `UNKNOWN` | "Something went wrong while processing this lesson." | Retry processing · Replace video · Delete |

No *Retry* for a corrupt file — it would fail again, and offering it wastes the instructor's time.

**A failed lesson is not deleted automatically.** It holds the title, description and position
the instructor chose; silently removing it turns a clear error into "where did my lesson go?".
It stays, red, until they replace or delete it. **Students never see it** (§19.5 — ready lessons
only).

**Toasts** (bottom-right, stacked, auto-dismiss 5 s, errors stay until dismissed):

| Event | Toast |
|---|---|
| upload finished | "Uploaded — processing has started" |
| a lesson becomes ready (detected by the studio's polling) | ✓ "'Intro' is ready to watch" · **Preview** |
| a lesson fails | ✕ "Couldn't process 'Intro' — the file looks corrupt" · **Replace** |
| delete / save / publish succeed | short confirmation ("Lesson deleted", "Course published") |
| any action fails | the API's message, never a stack trace |

**Before uploading**, the modal reads the file locally (a hidden `<video>`'s metadata) and shows
what it found — "1080p · 12:04". If the browser cannot read it the upload still goes ahead: browsers
cannot decode many formats FFmpeg can (ProRes, some HEVC), so this is a preview, never a gate.

**Replace keeps the lesson's identity** (id, title, position, any future progress data):

- `POST /api/v1/video-upload/:videoId/replace/presign` → upload URL for the same key
  `{videoId}/original.mp4`;
- `POST /api/v1/video-upload/:videoId/replace` → resets the video to `UPLOADED`, clears
  `hlsMasterPath`, `duration`, `resolutions` and the error, records the new file name/size/type, and
  republishes `video.uploaded`.

**Retry** — `POST /api/v1/video-upload/:videoId/retry`: only from `FAILED`, and only if the original
is still in the raw bucket (else `409` "the original is gone — replace it"); republishes the event.
All three are owner/admin only.

### 19.7 Admin

The admin console gains a **Courses** tab: every course including drafts, with instructor,
status, lessons and students; each opens that course's Studio. Admins already pass every role
check, so this is UI only.

## 20. LLD

**New dependencies** — `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu` (same family as
the existing `react-label`/`react-slot`; focus trap, Esc, scroll lock and ARIA done correctly), and
`sonner` for toasts (small, accessible, stacks, themed with the app's tokens; one `<Toaster />` in
the root layout). Rejected: a hand-rolled toast queue — focus, stacking and screen-reader
announcements are easy to get subtly wrong.

```
components/ui/dialog.tsx            Dialog, DialogContent, DialogHeader, DialogFooter (shadcn shape)
components/ui/dropdown-menu.tsx     DropdownMenu, …Item, …Separator
components/ui/confirm-dialog.tsx    useConfirm() → Promise<boolean>; tone 'danger' types the course name for course delete
components/studio/
  studio-header.tsx                 title, status pill, stats, Preview / Publish / ⋯
  lesson-list.tsx                   rows + empty state; drag-reorder (S3)
  lesson-row.tsx
  add-lesson-dialog.tsx             dropzone → title → upload → confirm
  edit-course-dialog.tsx
  price-field.tsx                   Free/Paid + amount + live preview (also on /courses/new)
  publish-dialog.tsx                checklist
components/instructor-preview-bar.tsx
lib/upload.ts                       uploadLesson(file, {courseId, title}, {onProgress, signal}) — presign → PUT → confirm
lib/filename.ts                     titleFromFileName("intro-to-kafka.mp4") → "Intro to kafka"
```

- `videosApi.uploadToS3` gains a `signal: AbortSignal` (axios supports it) — Cancel aborts the PUT;
  a cancelled upload never calls `confirm`, so no orphan `Video` row.
- Time remaining from a moving average of bytes/s over the last 5 s.
- `components/video-upload.tsx` is deleted; its logic moves into `lib/upload.ts`.
- Polling while anything is processing stays (5 s), moved into `lesson-list.tsx`.

**Backend changes:**

| Change | Phase |
|---|---|
| `409` on publishing a course with no `READY` video | S1 |
| `replace/presign`, `replace`, `retry` for a lesson (§19.8) | S1 |
| Price rule: `0`, or `1`–`500000` with ≤ 2 decimals (Joi, create + update) | S1 |
| `Video.position Int` (both Prisma schemas), backfilled by `createdAt`; new uploads append; `PATCH /api/v1/courses/:id/lessons/order { videoIds: string[] }` (owner/admin; must list exactly the course's videos) | S3 |
| `GET /api/v1/admin/courses` (all courses, incl. drafts) | S3 |

## 21. Phases

| Phase | Ships | Verified by |
|---|---|---|
| **S1 — Studio + Add-lesson modal** | Dialog/dropdown primitives; new Studio header with `⋯`; `+ Add lesson` modal (drag-drop, title from filename, progress, real cancel); lesson rows restyled; edit-details and confirm dialogs replace inline edit and `window.confirm`; `PriceField` on create + edit with the backend price rule; publish checklist + backend `409`; failed-lesson states, Replace / Retry and toasts (§19.8) | build + lint + backend test for the `409`; manual: upload, cancel mid-upload (no orphan row), publish blocked on an empty course |
| **S2 — Preview as a student** | `Preview` and per-lesson `▶` → learner page with `?lesson=`; instructor preview bar; ready-only lesson list for everyone; hard-coded marketing blocks removed; inline row players removed | build + manual as instructor, admin and student |
| **S3 — Order and oversight** | `Video.position` + reorder endpoint + drag-reorder; admin Courses tab | backend tests (order validation), build, manual |
| **S4 — Bulk upload** | pick several files → one lesson each, uploads queued 2 at a time in a tray that survives closing the modal; warn before leaving the tab mid-upload | manual with 5 files |
| Deferred | real thumbnails + durations (transcoder probe, §7.1 there), sections/modules, lesson-level drafts | — |

The video player redesign (Part V) is independent and can land before or after S2; S2 uses
whichever player exists.

## 22. Questions for you

1. **Order of work:** S1 → S2 first (the two things you asked for), then the player (Part V), then
   S3/S4? Recommended.
2. **The hard-coded learner-page content** ("Suitable for", progress points, "Mentor"): remove it
   (recommended), or turn it into real course fields an instructor fills in (a backend change —
   "What you'll learn", "Who it's for")?
3. **Bulk upload (S4)** — wanted in the first pass, or is one lesson at a time fine for now?

---

# Part VII — Product UI pass: every screen, scanned

> **Status: in progress** — requested by the user ("scan each and every component and make it more
> appealing; see this as a real product"). Built on the agreed Parts V and VI; this part covers
> everything else and orders the work. Each phase is screenshot-verified (before/after) in real
> Chrome before the next starts.

## 23. What the scan found (14 screens, 3 roles)

Grouped by how much they hurt a real user — cosmetic last.

**Things that look like they work and do not**

| Where | Finding |
|---|---|
| Sidebar | **Six of eleven items go nowhere** — Saved Courses, Report, Explore Course, Certificate, Help Center, Settings have no `href`. A user clicks, nothing happens. |
| Sidebar | "My Courses" also points at `/dashboard`, so **two items are highlighted at once**. |
| Top bar | **The search box searches nothing** (and reads "Try search programing course"). |
| Login | "Remember me" does nothing; "Forgot password?" has no flow behind it. |
| Sign-up | "Terms of Service" and "Privacy Policy" look like links and are not. |
| UI-config editor | **JSON validation is broken**: Monaco's worker fails to load (`Failed to parse URL from /monaco/vs/.../jsonWorker.js`), so the Problems panel can never report an error — the editor's safety net is silently off. |

**Things that are not true**

| Where | Finding |
|---|---|
| Learner page | **"Your Study Progress" is fake** — always 0%, "25/50/75/100 Points" that mean nothing, a canned "Great job! 🎉". "Course Completion 0/4" counts lessons *before the one selected*. |
| Learner page | "This Course Suit For:" bullets and "Mentor · Course Instructor" are hard-coded on every course. |
| Learner page | **Failed and processing lessons are shown to students** ("Corrupt file check — failed"). |
| Home, auth pages | Fabricated social proof: "50K+ learners", "4.2M lessons", "98% completion", testimonials from "Maya Chen" and "Priya Sharma", "40+ categories". |
| Purchases | A free enrolment reads "Free · PAID". |

**Things that make the product feel unfinished**

| Where | Finding |
|---|---|
| Every course card | Text-only: no cover art, no instructor, no length, "1 videos". Courses are indistinguishable. |
| Dashboard | No "continue where you left off"; the welcome repeats the user's email. |
| Instructor dashboard | Course cards do not say Draft or Live; no students/lessons summary. |
| Studio / create course | Covered by Part VI (upload card, inline players, `window.confirm`, no status). Create-course is a bare three-field form. |
| Admin console | One long page; every role shown twice (badge **and** select); orders identified by raw UUIDs and filtered by "user id", which no admin knows; free orders show provider "NONE". |
| Lesson rows | Duration shows "—" (the transcoder now reports it — §7.1 there). |

## 24. The fixes

**Shared foundation (U0)** — the pieces every screen below uses, so they look like one product:
`Dialog`, `DropdownMenu` (Radix), `Toaster` (sonner, §19.8), `Badge`, `Skeleton`, `EmptyState`,
`PageHeader`, `StatCard`, `Tabs`, and **`CourseCover`** — generated cover art (a gradient and
monogram derived from the course id, so it is stable and distinct per course) until instructors can
upload a thumbnail. One `pluralize()` so "1 lesson / 2 lessons" is right everywhere.

**Navigation (U1)**

- Sidebar lists **only real destinations**, by role. Everyone: *Home* (`/dashboard`), *Explore*
  (`/explore` — the catalogue with search), *Purchases* (`/orders`). Instructors: *Studio*. Admins:
  *Admin*, *UI Config*. The dead items are removed from the default UI config (a config migration,
  so a published config is upgraded too). Exactly one item is active, matched by path prefix.
- Search becomes real: typing filters the catalogue live (title, description, instructor) and
  `Enter` opens `/explore?q=…`. Client-side over the published list — enough at today's catalogue
  size; server-side search is recorded for when the list is paginated.

**Dashboard (U2)** — answers "what should I do next?":

- *Continue watching* — the last lesson with a resume position (local resume data, Part V), cover
  and progress bar, one click back into the player.
- *My learning* — cover cards with a real progress bar (lessons completed / ready lessons).
- Instructors get a *Studio* strip: their courses with Draft/Live, lessons, students, and
  *Create course*. The welcome drops the email.

**Learner course page (U3 = Part VI S2 + Part V P2)**

- Header: title, instructor, lessons · total length · price/"Owned".
- The player (Part V), theater mode, *Up next* with countdown, resume.
- **Study progress, made true**: a ring showing *lessons completed / ready lessons*, where a lesson
  counts as completed once watched to 90% (stored per viewer, like the resume position), plus
  *Continue: "Lesson 3" · from 4:12*. No points, no canned praise. Server-side progress (so it
  follows the student across devices) is a backend feature, recorded in §13.
- Lesson playlist styled like YouTube's: number/now-playing indicator, cover, title, duration,
  watched bar; **ready lessons only** for students; the instructor preview bar (§19.5).
- Hard-coded "Suit For" / "Mentor" removed.

**Studio (U4 = Part VI S1)** — exactly as Part VI, including the **+ Add lesson modal** that replaces
"Upload a video", failure states and toasts. *Create course* becomes a two-column page: the form
(with `PriceField`) on the left, a live preview of the course card on the right.

**Purchases (U5)** — cards with cover, course title linking to the course, date, amount, and a human
status: *Free*, *Paid*, *Refunded*, *Partially refunded*, *Failed*, *Expired*.

**Admin console (U6)** — tabs: *Overview* (users, instructors, courses, revenue, pending requests),
*Users* (table; role is one select, the badge goes), *Orders* (course title and buyer email — both
already stored on the order — instead of UUIDs; search by email; the full id one click away),
*Instructor requests*, *Courses* (Part VI §19.7).

**Marketing & auth (U7)** — the honest version:

- Home: replace fabricated numbers with real ones the API can answer (published courses,
  instructors, lessons) or drop the band; testimonials become a "built for" section until real
  quotes exist. All of it stays editable in the UI config.
- Login: remove "Remember me" (the session already persists for 7 days); hide "Forgot password?"
  until a reset flow exists — recorded as a backend feature, not faked.
- Sign-up: Terms/Privacy as plain text until those pages exist.

**Bugs (fixed in the phase that touches them):** Monaco worker URL (absolute origin) — U0; "1 videos"
pluralization — U0; "Free · PAID" — U5.

## 25. Order

| Phase | Ships | Why this order |
|---|---|---|
| **U0** | foundation components, Monaco worker fix, pluralize | everything below uses them |
| **U4** | Studio + Add-lesson modal + failure states + toasts + create-course page | the user named "Upload a video" |
| **U3** | learner course page incl. real study progress, playlist, theater, up next, resume, instructor preview | the user named "Your Study Progress" |
| **U1** | navigation without dead links, real search, `/explore` | every page shares it |
| **U2** | dashboard | depends on U1's routes and U3's progress data |
| **U5** | purchases | small |
| **U6** | admin console | admin-only |
| **U7** | marketing + auth honesty | copy changes, low risk |

Recorded, not built here: server-side progress, password reset, course thumbnail upload, server-side
search, certificates, saved courses.

---

# Part VIII — Visual design language

> **Status: built (V0a–V4), 28 Oct 2026.** Direction A, *Studio*, agreed by the user, who then asked
> for the whole UI to be built in phases without stopping for approval, with the UI config updated in
> the database too. During the build the user added three requests, recorded in §30.12:
> - a light/dark toggle for every viewer;
> - course thumbnails;
> - per-lesson thumbnails, with a YouTube-style random frame as the default.
>
> Verification results are in §33.
>
> Mockups of the three directions: https://claude.ai/artifact/PZnRyAyDuJqtSBztfphWGX

## 26. What is wrong, and where it lives

The look is the default output of a code model, not a decision. Each tell has an address:

| Tell | Where |
|---|---|
| Glass panels, glow shadows, animated blobs, spotlight and dot-grid backdrops | `app/globals.css` (`.glass`, `.glow-primary`, `.animate-blob`, `.bg-spotlight`, `.bg-grid`) |
| Gradient text on headlines and on the user's first name | `.text-gradient` — home hero, dashboard greeting, CTA band |
| Near-black with one acid-lime accent ("Midnight Premium") | `globals.css` `:root`, `ui-config.default.json` `theme` |
| Space Grotesk display + Inter body | `app/layout.tsx` |
| ~53 `rounded-2xl`, 7 `rounded-3xl`, 27 `backdrop-blur`, 15 `bg-gradient-*` | across `src/` — every surface gets the same treatment, so nothing stands out |
| Invented numbers: 50K+ learners, 1,200+ courses, 98% completion, 4.9/5, 4.2M lessons streamed | `app/page.tsx` (`stats`, `heroChips`) |
| Made-up testimonials (Maya Chen, Priya Sharma, "Northwind") | `app/page.tsx`, `components/auth-shell.tsx` |
| Features that do not exist: certificates, cohorts, quizzes, recommendations, 40+ categories | `app/page.tsx` (`features`), `auth-shell.tsx` |
| Centred hero with a sparkle pill, three identical feature cards, a faux dashboard of fake metrics | `app/page.tsx` |
| Gradient-and-monogram course covers instead of frames from the lesson | `components/course-cover.tsx`, `course-card.tsx` |

Part VII §24 (U7) already called for removing the fabricated content; it has not shipped. This part
absorbs it — honest content is a design rule here, not a copy edit.

Sources for "what reads as generated" (2025–26): The Fountain Institute's *7 tells*, SaaSUI's
*Why your SaaS UI looks AI-generated*, Anthropic's *Improving frontend design through skills*
("distributional convergence"), Refactoring UI. Recurring antidotes: one accent tied to meaning, a
type scale with real contrast, spacing rhythm (tight in a group, loose between), hierarchy by
de-emphasis, one structural device used consistently, designed empty/error states, real copy.

## 27. Goals and non-goals

**Goals**

- A visual language that is *chosen*: a palette with a reason, a type pairing with a reason, one
  structural device (panels **or** rules **or** borders — not all three).
- Every number and claim on screen is true. The dashboard shows only what the API or local watch
  history can answer; the landing page describes features that exist.
- Content carries the colour: real lesson frames (`{videoId}/poster.jpg`, already written by the
  transcoder and resolved by `lib/playback.ts#posterUrl`) replace generated covers wherever a READY
  lesson exists.
- One primary action per screen. On the dashboard that is *Resume*.
- The whole app in one language — the dashboard and landing first, then every screen in Part VII.

**Non-goals**

- No new product features. Streaks, leaderboards, certificates, calendars and instructor revenue
  charts are out until the data behind them exists (they are what make Dribbble shots fail on real
  data: empty calendars, zero-streak shame, fake KPIs).
- No change to routes, guards, the API layer, the buy flow or player behaviour (Parts II, III, V).
- No new runtime component library that owns styling (§29).
- Not a marketing site rebuild on a separate stack; the landing page stays `app/page.tsx`.

## 28. The three directions

Each is drawn in the mockup link above with identical content, so only the design differs.

| | **A · Studio** (recommended) | **B · Theater** | **C · Workbench** |
|---|---|---|---|
| Character | Light, calm, type-led; the vidyst.com family | Dark, poster-led, a streaming app | Dense, precise, keyboard-first; Linear / GitHub family |
| Palette | Paper white, ink `#111113`, a second grey tone for two-tone headings, `#f4f4f5` panels, **one highlighter yellow** that marks "you are here" (active page, current lesson, today) | Soft graphite (not black), white controls, **no UI accent** — colour comes only from lesson frames | White + cool side panel, ink, 1px rules, **one ink-blue** for progress and primary actions |
| Type | Geist 600 with tight tracking for display, Geist body, Geist Mono for timecodes | Schibsted Grotesk 800 display / 400–600 body, Geist Mono timecodes | IBM Plex Sans + IBM Plex Mono |
| Structure device | Soft grey panels, no shadows | Full-bleed frames and rows | 1px borders and tables |
| Dashboard | Two-tone greeting · *Continue* panel with the lesson frame and *Resume at 07:42* · *This week* (minutes watched per day, from `lib/progress`) · courses as scannable rows with a thin bar and *n of m lessons* · new courses | Big *Continue watching* banner · one line of stats · rows of frames | *Up next* strip (resume with ↵) · progress table with **one tick per lesson** · 12-week activity grid · compact catalogue list |
| Landing | Two-tone headline with inline icon tiles, the real player + lesson list as the hero image, black pill buttons | Copy left, a wall of lesson frames right | Left-aligned, a real syllabus as the hero, three specs instead of stats |
| Best at | Landing, dashboard, long study sessions | Catalogue and watching | Studio, admin, power users |
| Weak at | Needs type discipline everywhere or it looks plain | Studio/admin forms; looks empty without good thumbnails | First impression for a new student |

**Recommendation: A, with B's dark treatment kept for the course player page only.** Reasons:

1. It is the direction the user pointed at (vidyst.com), and it reads as a product rather than a
   template because the identity lives in typography and one meaningful accent, not effects.
2. Learning sessions are long; a quiet light shell with a dark player is the pattern of the
   products people study on (Coursera, Udemy, Khan) and keeps the video the brightest-contrast
   object on the page.
3. The highlighter accent encodes something true (where you are), so it never needs to decorate.
4. Its weak point (needs discipline) is solved by tokens and a short rule list (§30), which this
   project already enforces through components in `components/ui/`.

Mixes are fine: A for the app with C's per-lesson ticks on the course page, for example.

## 29. Constraints the design must respect

**The UI-config theme contract.** `theme` is four HSL values (`primary`, `accent`, `background`,
`radius`) written onto `<html>` as CSS variables, and `layout.tsx` hard-codes `className="dark"`.
A light direction (A or C) therefore needs **a contract change**, not just new CSS: the published
config's `background: "240 24% 5%"` would otherwise paint a light design dark. Options for the LLD:
an optional `theme.mode` (`light` | `dark`, default `light`) plus a config migration in
`backend/config/ui/migrations.ts` that rewrites the old dark default — the same mechanism U1 used for
the navigation. This touches `backend/SYSTEM_DESIGN.md` Part IV, so it is called out here rather than
discovered in a PR.

**The stack.** Next 14.2 · React 18 · Tailwind 3.4. Checked against npm peer dependencies:

| Library | Verdict |
|---|---|
| Radix primitives (already used) | Keep; add Tooltip, Popover, Progress, ScrollArea, Avatar, Select as screens need them |
| shadcn/ui CLI | Usable on Tailwind 3 for copy-in components and blocks (sidebar, command). Copied, then restyled to our tokens — its defaults are themselves a recognisable look |
| `cmdk` | For ⌘K search over the catalogue (search is already client-side, Part VII U1) |
| Recharts | Only if a chart is needed (C's heatmap, a future instructor chart); themeable with our tokens |
| `geist` npm package | **Required for A** — Geist is not in `next/font/google` on Next 14.2 |
| HeroUI 3, Untitled UI React, Catalyst | Rejected: need React 19 and/or Tailwind 4 |
| Aceternity UI, Magic UI | Rejected: their effects *are* the generated-landing-page look being removed |
| Mantine, Radix Themes | Rejected: a second styling system next to Tailwind (§3 already chose Tailwind as the only one) |

**Accessibility.** Text contrast ≥ 4.5:1 in every state; the highlighter is a background behind ink,
never text colour on white; focus rings visible on every interactive element;
`prefers-reduced-motion` honoured (already done for the player and overlays).

**Real data only.** Dashboard numbers come from `coursesApi` and `lib/progress` (`updatedAt`,
`position`, `duration`, `completed`). Progress is per browser until server-side progress exists
(§13), so the weekly panel says "on this device" if that ever matters to users.

## 30. LLD — Studio

Direction A is agreed. Defaults taken for the open questions (§32): **no lime** anywhere; **light by
default** via a UI-config contract change; the landing page **speaks to students first**, with one
section for instructors.

### 30.1 Two looks, one set of token names

Every colour is a semantic token. Two token sets define the same names:

- **`studio`** — light. The app.
- **`theater`** — dark. Always used inside the video player, and app-wide when the config says
  `mode: "dark"`.

A component never knows which look it is in. It uses `bg-surface`, never `bg-white/5`.

```
<html data-look="studio">                    ← from config.theme.mode, server-rendered, no flash
  …app…
    <div data-look="theater"> <VideoPlayer/> </div>   ← the player is always dark
```

`globals.css` defines `:root, [data-look="studio"] { … }` and `[data-look="theater"] { … }`, as HSL
triplets so Tailwind's `hsl(var(--x) / <alpha>)` keeps working. `layout.tsx` stops hard-coding
`className="dark"`.

| Token | Studio | Theater | Role |
|---|---|---|---|
| `--background` | `#ffffff` | `#16161a` | page |
| `--surface` | `#f4f4f5` | `#1f1f24` | grey panels, inputs, search, skeletons |
| `--surface-raised` | `#ffffff` | `#26262c` | the active item on a panel, popovers |
| `--foreground` | `#111113` | `#f2f2f0` | ink: headings, primary text, primary buttons |
| `--body` | `#5d5d62` | `#b4b4bb` | running text |
| `--muted-foreground` | `#8b8b90` | `#9a9aa3` | the second tone of two-tone headings, captions, meta |
| `--border` | `#e8e8eb` | `#2c2c33` | 1px lines on lists and inputs |
| `--primary` / `-foreground` | ink / white | white / graphite | actions. **The action colour is ink, not a hue** |
| `--highlight` / `-foreground` | `#ffe14a` / `#2e2700` | same | "you are here" only — from `config.theme.highlight` |
| `--success` | `#17804a` | `#4ade80` | completed, paid, live |
| `--warning` | `#a15c07` | `#fbbf24` | processing, pending, draft |
| `--danger` (`--destructive`) | `#c4320a` | `#f87171` | failed, refunded, destructive actions |
| `--info` | `#2747d6` | `#7aa2ff` | neutral notices |
| `--ring` | ink at 35% | white at 45% | focus |

The shadcn names already in `tailwind.config.ts` (`card`, `popover`, `secondary`, `muted`, `accent`,
`input`) stay as aliases (`card` → `surface-raised`, `muted`/`secondary` → `surface`,
`accent` → `surface`), so untouched code keeps compiling. Most existing `text-primary` uses are
lime eyebrows and links; they become ink, which is the intent.

**Rules the tokens enforce**

1. **Highlight is a background behind ink, never text or an icon on white.** Contrast is about 1.3:1
   as a text colour and about 15:1 behind ink. Uses: the active nav marker, the current lesson row,
   today's bar, the player's played range, a highlighted word on the landing page. Nothing else.
2. **One structural device per group.** A filled panel (`bg-surface`, no border) for the one hero
   element of a screen. A 1px `border` for lists and secondary groups. Never both on one element,
   and **no shadows** except overlays (dialog, popover, dropdown: one `shadow-overlay`).
3. **Status is semantic.** `success`, `warning`, `danger` and `info` encode state, never decoration.

### 30.2 Type

`geist` npm package (OFL): `GeistSans` and `GeistMono`, because Geist is not in `next/font/google`
on Next 14.2. Inter, Space Grotesk and JetBrains Mono are removed from `layout.tsx`. `font-display`
stays as a utility name but resolves to Geist. Display is distinguished by weight and tracking, not
by a second family.

| Tailwind class | Size / line height | Tracking | Weight | Used for |
|---|---|---|---|---|
| `text-display-xl` | `clamp(44px, 6vw, 76px)` / 1.02 | −0.048em | 600 | landing hero |
| `text-display-l` | `clamp(34px, 4.4vw, 56px)` / 1.05 | −0.04em | 600 | landing section heads |
| `text-display-m` | `clamp(26px, 3vw, 34px)` / 1.1 | −0.038em | 600 | page greeting, page titles |
| `text-title` | 22px / 1.2 | −0.03em | 600 | the lesson in *Continue*, dialog titles |
| `text-heading` | 17px / 1.3 | −0.02em | 600 | section heads in the app |
| `text-sm` (body) | 14px / 1.5 | 0 | 400 / 500 | app body |
| `text-lead` | 18px / 1.6 | 0 | 400 | landing paragraphs |
| `text-[13px]`, `text-xs` | 13 / 12px | 0 | 400 | meta, captions |
| `font-mono tabular-nums` | 12–13px | 0 | 400–500 | timecodes, prices, counts, `⌘K` |

**Two-tone headings** are the signature: `<TwoTone lead="Good afternoon, Aarav." trail="Three
courses in progress." />` renders the trail in `muted-foreground`. Used once per screen at most.

### 30.3 Shape, space, motion, icons

- **Radius:** `--radius: 0.625rem` (10px) for controls; `rounded-panel` = 18px for hero panels;
  `rounded-full` only for pills, avatars and the play button. `rounded-2xl` / `rounded-3xl` go.
- **Space:** a 4px grid. 8–14px inside a group, 28–32px between sections. Page gutter 36px on
  desktop, 16px on phones. The content column is capped at 1200px.
- **Motion:** 150ms ease-out on hover and state changes only. The existing Radix overlay keyframes
  stay. `animate-fade-up`, `animate-blob`, `animate-pulse-glow` and the `animation-delay-*` utilities
  are deleted. Everything honours `prefers-reduced-motion`.
- **Icons:** lucide stays, 18px, stroke 1.75. Icons go in navigation and in buttons that do
  something. They do not go on section headings, stat labels or in coloured tiles beside feature
  copy. The one exception is the landing page's inline headline tiles (§30.9).

### 30.4 UI-config contract v2 (cross-service)

Today `theme` is `{ primary, accent, background, radius }`, and a free `background` lets an admin
publish a light design painted dark, or a contrast failure. v2:

```jsonc
"theme": {
  "mode": "light",                // "light" → studio, "dark" → theater, app-wide
  "highlight": "50 100% 65%",     // HSL; the "you are here" colour
  "radius": "0.625rem"
}
```

| File | Change |
|---|---|
| `backend/config/ui/ui-config.schema.json` | `schemaVersion` enum `[2]`; new `theme` shape; `home.sections[].type` gains `faq` (§30.9) |
| `backend/config/ui/migrations.ts` | `CURRENT_SCHEMA_VERSION = 2`; v1 → v2: `mode: "light"`; `highlight` = old `primary` unless it is the old lime default (`83 78% 55%`), in which case the new default; `radius` likewise (`0.75rem` → `0.625rem`); drop `accent` and `background`. Runs on read and on seed, so the published config upgrades itself |
| `backend/config/ui/ui-config.default.json` | v2 default; copy without invented claims (§30.9) |
| backend validator + Jest | v2 shape; a migration test (old default → new default, a custom primary kept as `highlight`) |
| `frontend/src/lib/ui-config/{types,defaults,theme}.ts` | v2 types; `npm run ui-config:sync`; `themeVars` emits `--highlight`, `--radius`; new `themeLook(theme)` → `"studio"`/`"theater"` for `<html data-look>` |
| `components/ui-config/config-preview.tsx` | preview applies `data-look` and the vars to its own frame |
| `backend/SYSTEM_DESIGN.md` Part IV | records v2 |

A backend that is down, or still serving a v1 document, fails the frontend's `looksLikeUiConfig`
shape check and the bundled v2 default renders, so the two can deploy in either order.

### 30.5 Removing the hard-coded dark — a codemod, then design

The dark look is written into class names, not tokens: **287** `white/…` classes, **244** raw palette
colours (`emerald-300`, `amber-400` …) and **27** hex or `hsl()` literals across **71** files. A
light theme cannot arrive until those are semantic, so V0a converts them mechanically first, with
the theater values set to today's palette so the app looks the same afterwards.

`frontend/scripts/codemod-tokens.mjs` (runs once; its diff is the review):

| From | To | Exception |
|---|---|---|
| `bg-/border-/ring-/divide-white/N` | `…-foreground/N` | `components/player/*`: over video, white is correct in both looks |
| `text-white`, `text-white/N` | `text-foreground`, `…/N` | player, as above |
| `emerald-*` · `amber-*` · `red-*`/`rose-*` · `sky-*` | `success` · `warning` · `danger` · `info` (opacity kept) | — |
| `lime-*` | `primary` | — |
| `bg-black/N` on scrims and overlays | unchanged | scrims stay black in both looks |
| hex / `hsl()` literals | hand-mapped in the same PR | 27 occurrences, each reviewed |

**A guard so the old look doesn't return.** `scripts/check-styles.mjs` runs inside `npm run lint`.
It fails on any of the following outside `components/player/*`:
- `white/` or `black/` classes (apart from scrims);
- raw palette colours;
- `backdrop-blur`;
- gradient text;
- `rounded-3xl`;
- the deleted utilities (`glass`, `text-gradient`, `glow-primary`, `bg-spotlight`, `bg-grid`, `animate-blob`).

It is a script and not an ESLint rule, because the patterns live inside className strings.

### 30.6 Primitives (`components/ui/*`, V0b)

| Component | Studio treatment |
|---|---|
| `Button` | `default`: ink pill (`rounded-full`, h-10, px-[18px]), no glow, no `active:scale`. `secondary`: surface pill. `outline`: 1px border pill. `ghost`: text, surface on hover. `destructive`, `link`. Sizes sm 32 · md 40 · lg 48 |
| `Input` / `otp-input` | h-10, `rounded-[10px]`, `bg-surface`, no border until focus; focus = `border-foreground/30` + ring |
| `Badge` | `rounded-md` chips (6px), tone = semantic token at 10% behind its full colour; no ring. `dot` kept for live/processing only |
| `Card` | `variant="panel"` (surface fill, `rounded-panel`, no border) and `variant="outline"` (1px border, background) — never both |
| `Dialog`, `DropdownMenu`, `Tabs` | content on `background`, 1px border, `shadow-overlay`, 14px radius; scrim `black/40`. Tabs become a segmented control (surface track, raised active) |
| `EmptyState` | left-aligned inside its section: title, one sentence, one action. The dashed box and icon tile go |
| `PageHeader` | title in `text-display-m`, optional `trail` in the second tone; eyebrow becomes sentence case, not uppercase tracking |
| `StatCard` | number in `text-title` mono, label below, no icon tile. Admin only |
| `Skeleton` | `bg-surface`, pulse off under reduced motion |
| **New** `Kbd`, `ProgressBar` (6px, ink on surface, `aria-valuenow`), `Avatar` (initials), `TwoTone`, `IconTile` | small, used by V1–V3 |

`components/brand.tsx`: an ink rounded square with a highlight play glyph, plus the wordmark in one
weight. `branding.logoUrl` still wins. The lime gradient mark goes.

### 30.7 App shell and dashboard (V1)

**Shell** (`components/app-shell.tsx`, `app-header.tsx`):
- **Sidebar:** 224px on `background` with a 1px right border; 64px when collapsed.
- **Active nav item:** `surface-raised`, a 1px border and a small highlight square on the right.
  Nav items still come from the config.
- **Top bar:** ⌘K search on `cmdk`, over the same client-side catalogue search as today (Part VII
  U1); notifications; the avatar menu (Purchases, Notifications on/off, Log out).
- **Mobile:** the existing Radix sheet, restyled.

**Dashboard** (`app/dashboard/page.tsx`, split into `components/dashboard/*`):

| Section | Shows | Data | Empty / loading |
|---|---|---|---|
| Greeting | `TwoTone`: "Good afternoon, Aarav." + one true sentence ("Three courses in progress." / "Pick a course to start.") | `user`, `enrolled`, progress | skeleton line |
| `ContinuePanel` | the last unfinished lesson: frame, played bar in highlight, "Continue · Lesson 4 of 12", title, course · instructor, **Resume at 07:42** (ink pill), time left in mono | `lastUnfinished(progress)` + one `getById` (as today) | hidden when there is nothing to resume |
| `WeekPanel` | minutes watched per day (Mon–Sun bars, today in highlight), total, lessons finished this week, days active, caption "On this browser" | **new** `lib/activity.ts` (below) + `progress.completed`/`updatedAt` | "Your week fills in as you watch." |
| In progress | `CourseRow` per enrolled course: frame, title, instructor · n lessons, `ProgressBar` + "3 of 12 lessons", last watched (relative), *Continue* | `enrolled`, `progress` | "Pick your first course" + four catalogue cards |
| Completed | the same rows, collapsed behind a "Completed (n)" toggle | same | hidden at 0 |
| Your studio (instructor/admin) | rows: course, Live/Draft badge, lessons, students, price, *Manage*; *Create course* | `coursesApi.mine()` | "Create your first course" |
| New on LearnSphere | four `CourseCard`s not owned and not your own | `coursesApi.list()` | `copy.emptyCatalogue` |

Rows rather than a card grid: the products people study on (Udemy, Coursera, edX) all converge on a
scannable list with one thin bar and one *Resume*, and rows survive 80-character titles.

**`lib/activity.ts`.** Today's progress map keeps each lesson's last position, not how long anyone
watched, so "minutes watched per day" cannot be derived honestly from it. The new module keeps one
more small local ledger:
- **Storage:** `learnsphere.activity.v1.{userId}` holding `{ "2026-10-28": 1460, … }` (seconds per
  local day), pruned to 84 days. Every access is in `try/catch`, like `lib/progress`.
- **Recording:** `recordWatch(userId, deltaSeconds)` is called from the course page's existing
  `onProgress`. The delta between successive positions counts only when it is forward and under
  30s, so seeking and scrubbing do not count.
- **Tests:** Vitest for day bucketing across midnight, the 30s cap and pruning.

It starts empty the day it ships. The panel says so rather than back-filling.

### 30.8 Course art (V3)

- **Backend (additive, no contract break):** every course list response gains
  `coverVideoId: string | null`, the first READY lesson by `createdAt`. That covers
  `listPublishedCourses`, enrolled, mine and admin, via one more `include` (`take: 1, select id`).
- **`CourseCover`:** shows `posterUrl({ id: coverVideoId })` when there is one.
- **Fallback when there is no READY lesson:** a *typographic* cover in place of the gradient. The
  course title is set in `text-title` on one of five muted paper tints (`#dfe8d8`, `#ffe9a8`,
  `#e6e1f5`, `#dde9f2`, ink with white text), chosen by the existing stable hash.

### 30.9 Landing and auth (V2)

Sections, top to bottom. All copy comes from the config; nothing claims a feature that does not
exist.

1. **Nav:** logo; *Courses* (→ `/login?next=/explore`), *Teach*, *How it works*, *Questions*;
   *Log in*; *Get started* (ink pill).
2. **Hero:**
   - Eyebrow, then `hero.title` in ink and `hero.titleHighlight` in the second tone, at
     `text-display-xl`.
   - Two decorative `IconTile`s sit at the end of the first line and the start of the second. They
     are fixed by design, so admin text stays plain.
   - Subtitle; `hero.ctaLabel` as an ink pill and *Teach on LearnSphere* as a text link;
     `hero.footnote` in mono.
3. **Product frame:** the course page drawn in HTML and CSS: the dark player with played range,
   timecode, J K L keys and quality, beside the lesson list with ticks. No screenshot to go stale,
   no invented metrics.
4. **`features` → "What you get":** a grid of panels for features that exist:
   - adaptive streaming up to 4K;
   - resume to the second;
   - YouTube's keyboard shortcuts;
   - pay per course in ₹ or $;
   - email receipts.
5. **`howItWorks` → "For instructors":** create a course → upload lessons (transcoded
   automatically, with a poster frame) → publish when the checklist passes.
6. **`faq` (new section type) → "Questions":** a numbered accordion (Radix). The numbers are
   legitimate here as an index.
7. **`finalCta`:** one panel with a two-tone line and the CTA.
8. **Footer.**

The stats band, the testimonial and the faux metrics dashboard are deleted, not restyled.

**Auth** (`components/auth-shell.tsx`, `login`, `signup`, `verify`):
- Two columns. The left panel (`bg-surface`) has a two-tone line and three true statements. The
  testimonial, "40+ categories" and "certificates" go.
- The form column uses the restyled `Input`, the ink pill button and inline errors.
- Part VII U7 lands here: no "Remember me", no "Forgot password?" until a reset flow exists, and
  Terms/Privacy as plain text.

**A real catalogue on the landing page is deferred.** `GET /courses` requires sign-in today. The
trigger to reopen it is a public catalogue endpoint, which is a backend decision.

### 30.10 Course page, explore, the rest (V3, V4)

- **Course page:** the player sits in a full-width `data-look="theater"` band. Title, instructor
  and meta sit below it on studio, with the lesson list as a bordered panel. The current lesson
  takes the highlight row; completed lessons get a success tick. Theater mode stays dark. The
  player's played range uses `--highlight`.
- **`/explore`:** a search field (shared with ⌘K), filter chips (Free / Paid / Not started), and
  the four-column `CourseCard` grid with real frames.
- **`CourseCard`:**
  - Layout: frame, title (2 lines), instructor, then a meta row with lessons and price in mono.
  - Hover: a 1px border appears. No lift and no shadow.
  - Badges move off the image into the meta row.
- **V4:** studio, create-course, purchases, the admin console and the UI-config editor chrome get
  the same primitives. Tables use 1px row lines. Monaco keeps its own dark theme inside a theater
  band.

### 30.11 Verification

Every phase is checked the same way:
- **Build and lint:** `npm run build` and `npm run lint`, including `check-styles`.
- **Tests:** Vitest (`activity`, `themeVars`/`themeLook`). Backend Jest wherever the UI config or
  course lists change.
- **Screenshots** in Chrome at 1440px and 390px, before and after:
  - landing;
  - login;
  - the student dashboard: with progress, and empty;
  - the instructor dashboard;
  - a course page while playing;
  - explore;
  - studio;
  - admin.
- **Test accounts:** created through the normal signup on localhost. SMTP is not configured locally,
  so the OTP is read from the `notifications` Kafka topic in Kafka UI on `:8080`.

V0a has one extra check: its screenshots must match the "before" ones. The codemod is meant to
change nothing you can see.

### 30.12 Added during the build, at the user's request

**Everything on the landing and auth pages is config.** UI-config v2 grew beyond the theme:
- `home.hero` gained `secondaryLabel` and `secondaryHref`.
- `home.features` holds up to 6 items, each an allow-listed icon, a title and a body.
- `home.howItWorks` holds up to 4 steps.
- `home.faq` holds up to 10 question/answer pairs.
- `home.finalCta` is the closing call to action.
- `auth` holds the heading and up to 4 points beside the sign-in forms.
- `TwoToneHeading` (`title` + `titleHighlight`) is the shared shape for headings.

The v1→v2 migration keeps every field an admin changed and replaces only v1's shipped default copy.
`npm run ui-config:publish-default` (backend) appends the checked-in default as a new published
version. It is idempotent and keeps history, so rollback stays one click in the editor. **The live
database was published to v3 (schema v2) this way.**

**Viewer light/dark toggle.**
- **Default:** `theme.mode` in the config is the default look.
- **Override:** each viewer can choose Light, Dark or System. The choice lives in the `ls-look`
  cookie (`lib/look.ts`), so the server renders an explicit choice correctly.
- **No flash:** a 300-byte inline script in `<head>` settles "System" before first paint.
- **Where:** Appearance (segmented) in the account menu; a sun/moon button in the app's top bar,
  the landing nav and the auth pages.
- **Dark is the theater token set app-wide.** A `theater:` Tailwind variant covers the few
  elements that differ: the brand mark and the icon tiles become a highlight tile with an ink glyph.

**Course and lesson thumbnails.**

| | Course | Lesson |
|---|---|---|
| Stored | `Course.thumbnail` (existing column, now an S3 key) | `Video.thumbnail` (new column) |
| Bucket / key | `S3_ASSET_BUCKET` (default `course-assets`) · `course-thumbnails/{courseId}/{uuid}.{ext}` | same bucket · `lesson-thumbnails/{videoId}/{uuid}.{ext}` |
| Upload | `POST …/thumbnail/presign` → browser PUTs to S3 → `PUT …/thumbnail {key}`, which checks prefix, ≤ 5 MB, JPG/PNG/WebP | same, under `/video-upload/:videoId` |
| Serve | public `GET /courses/:id/thumbnail` → 302 to a 1 h signed URL; the frontend adds `?v={key}` so a replaced image is never served from cache | `GET /video-upload/:videoId/thumbnail` |
| Remove | `DELETE …/thumbnail` → back to automatic | same |
| Automatic | the first ready lesson's frame (`coverVideoId` on every course list), else a title card | the transcoder's poster |

The free-text `thumbnail` URL that create/update used to accept is gone. An arbitrary external image
URL shown to every student is a tracking pixel waiting to happen.

**The transcoder's poster is a random frame, like YouTube's.**
- **Where:** `posterTime(duration, videoId)` picks a point between 15% and 75% of the video, never
  in the first or last second.
- **Seed:** the pick is seeded by the video id, so a retried encode produces the same frame.
- **Short clips:** a clip under 3 s gets its middle frame.

**Studio:** a `ThumbnailField` sits in the course details and the lesson editor. It saves the moment a
file is picked, shows upload progress, and offers "Use automatic" to remove a custom image.

## 31. Phases

| Phase | Ships | Done when |
|---|---|---|
| **V0a** | Semantic token names (theater values = today's palette), the codemod over 71 files, `check-styles` | Build and lint pass; screenshots unchanged |
| **V0b** | UI-config v2 + migration (backend + frontend); `data-look` on `<html>`; studio tokens; Geist; restyled primitives and brand; deleted effect utilities; player scoped to theater | Every screen renders light and readable; the published config upgraded itself; a `mode: "dark"` draft previews as theater |
| **V1** | Shell (sidebar, top bar, ⌘K), dashboard sections, `lib/activity.ts` + its recording on the course page | The student, instructor and empty dashboards match §30.7 at both widths |
| **V2** | Landing (incl. the new `faq` section) and auth pages; Part VII U7 | No invented number or feature remains on `/`, `/login`, `/signup` |
| **V3** | `coverVideoId` (backend), `CourseCover`/`CourseCard`, course page, `/explore` | Covers show real frames; the player band is theater |
| **V4** | Studio, create-course, purchases, admin, UI-config editor chrome | `check-styles` passes with no exceptions left outside the player |

**Deferred, with triggers:**
- **Full dark-mode polish:** `mode: "dark"` works from V0b but is only screenshot-checked on the
  dashboard and landing. Reopen when someone asks for dark mode.
- **Real catalogue on the landing page:** reopen when a public catalogue endpoint exists.
- **Illustration and avatar art, instructor analytics charts:** reopen when instructors have data
  worth charting.
- **Server-side watch history:** §13.

## 32. Questions — answered

1. **Direction:** A · Studio (user, 28 Oct 2026).
2. **No lime:** the highlighter yellow is the accent. The config's `highlight` lets an admin change it.
3. **UI-config v2:** adopted; the live database was upgraded to it (§30.12).
4. **Landing voice:** students first, with one section for instructors (`#teach`).
5. **Phase cadence:** the user asked for all phases to be built without stopping, then verified
   together (§33).
