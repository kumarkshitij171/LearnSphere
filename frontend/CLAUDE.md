# CLAUDE.md — frontend

Next.js 14 App Router + Tailwind + shadcn-style UI. Port `3000`. Read the root
`CLAUDE.md` alongside this file — in particular **Ways of Working**: HLD and LLD
are discussed and agreed before implementation, and implementation lands in
numbered phases.

## Commands

```
npm install
npm run dev
npm run build
npm run start
npm run lint
```

`@/` is the path alias for `src/`. Use it; no `../../..` imports.

## The API layer is the only way to talk to the backend

Everything lives under `src/lib/api/` and each file has one job. Breaking this
layering is the most common mistake in this codebase.

| File | Role |
|---|---|
| `src/config/env.ts` | The **only** place that reads `process.env`. Validates at startup, throws in prod, falls back in dev. Import the typed `env` object everywhere else. |
| `lib/api/client.ts` | `createClient(baseURL)` builds every axios instance (`withCredentials: true`) with the shared 401 interceptor: `apiClient` (backend) and `orderClient` (order-service). Refresh always runs against the backend. `onSessionExpired` notifies when a refresh fails. |
| `lib/api/endpoints.ts` | Central registry of every path. **Never hand-type a URL.** |
| `lib/api/*.service.ts` | Typed wrappers that UI components call: `users`, `courses`, `videos`, `admin`, `orders` (incl. `adminOrdersApi`). |
| `lib/api/index.ts` | Barrel. Components import from `@/lib/api`, not from the individual service files. |

**Rules that matter:**

- A component never imports `axios` directly and never calls `apiClient` with a
  literal URL. It calls a `*.service.ts` function.
- Adding an endpoint means: add the path to `endpoints.ts`, add a typed wrapper
  to the matching `*.service.ts`, re-export it (and its types) from `index.ts`.
- The interceptor does a **single-flight refresh**: when several requests 401 at
  once only one `/refresh-token` call is made and the rest await that same
  promise. Don't add a second refresh path.
- `NON_REFRESHABLE_PATHS` (login, register, verify, reverifyEmail,
  refreshToken) are exempt from the refresh-and-retry so their own errors reach
  the caller intact. A new auth-adjacent endpoint probably belongs in that list.
- `getApiErrorMessage` is the shared way to turn a caught error into UI text.

## Buying a course

`components/buy-course.tsx` is the only buy flow. **The browser never decides money
moved**: every path ends in polling `GET /orders/{id}` until the webhook marks it
`PAID`, then polling the course until enrolment shows up. Keep the idempotency key per
purchase intent (`intentRef`) — it is what makes a double click or a reopened modal
return the same order. Money is shown with `lib/money.ts` (`formatPrice` for catalogue
prices, `formatMinor` for order amounts), never with a hard-coded symbol.

## UI configuration

Presentation comes from the published UI config: the root layout reads it on the server
(`lib/ui-config/server.ts`, theme as CSS variables on `<html>` so there is no flash), and
components read it with `useUiConfig()`. If the fetch fails the bundled default — today's UI —
renders. New configurable text or toggles: add them to `backend/config/ui/` (schema + default)
first, then `npm run ui-config:sync`, then read them here. Icons are an allow-list
(`lib/ui-config/icons.ts`); config never names a component. The editor is
`/admin/ui-config` (`components/ui-config/`, Monaco served from `public/monaco`).

## Routes and guards

`src/app/` — `page` (home), `login`, `signup`, `verify` (OTP), `dashboard`,
`admin`, `admin/ui-config` (ADMIN only), `orders` (purchases), `courses/new`, `courses/[id]`,
`courses/[id]/manage`.

- `hooks/useGuestOnly.ts` — bounces an authenticated user away from login/signup
- `hooks/useRequireAuth.ts` — bounces an anonymous user to login

Use the hooks; don't re-implement redirect logic inside a page.

## Components

- `components/ui/` — shadcn-style primitives (`button`, `card`, `input`,
  `label`, `otp-input`). Extend these rather than styling raw elements.
- `components/` — app-level composites: `app-shell`, `app-header`, `auth-shell`,
  `brand`, `course-card`, `role-badge`, `video-upload`.
- `lib/utils.ts` holds `cn()` for class merging.

## Video playback

`lib/player.tsx` wraps `hls.js`; `lib/playback.ts` resolves playback URLs and is
the other consumer of `@/config/env`. Safari plays HLS natively — keep the
native-support branch when touching the player.

## Comments

Minimal, generic, to the point. One short line explaining *why* beats a block
restating *what*.
