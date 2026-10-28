# LearnSphere frontend

The web app: browse and buy courses, watch them, upload and manage your own as an instructor,
and run the platform from the admin console — including a VS Code-style editor for the UI
configuration. Next.js 14 (App Router) + Tailwind, port `3000`.

> How it is built and why: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

## Prerequisites

- Node.js 22+ and npm
- The backend running (and order-service / notification-service for purchases and push)

## Setup

```bash
npm install                    # also copies Monaco into public/monaco for the config editor
cp .env.sample .env.local
```

## Run

```bash
npm run dev                    # http://localhost:3000
npm run build && npm start     # production build
npm run lint
```

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | the backend, e.g. `http://localhost:5000` |
| `NEXT_PUBLIC_ORDER_API_URL` | order-service, default `http://localhost:8086` |
| `NEXT_PUBLIC_NOTIFICATION_API_URL` | notification-service, default `http://localhost:8085` |
| `NEXT_PUBLIC_TRANSCODER_URL` | where HLS video is streamed from |
| `NEXT_PUBLIC_FIREBASE_*` | optional — push notifications are offered only when all five are set |

In production a missing required variable fails the build instead of silently pointing at
localhost.

## What is where

| Route | Who | What |
|---|---|---|
| `/` | everyone | landing page (copy comes from the UI config) |
| `/login`, `/signup`, `/verify` | guests | sign-up with an emailed code |
| `/dashboard` | signed in | my learning, the catalogue, my courses as an instructor |
| `/courses/[id]` | signed in | watch, or buy |
| `/courses/new`, `/courses/[id]/manage` | instructors | create a course, upload videos |
| `/orders` | signed in | purchase history |
| `/admin`, `/admin/ui-config` | admins | users, instructor requests, orders and refunds, UI configuration |

## Buying a course locally

Payments run on order-service's mock provider by default: click **Buy**, then **Pay** in the
test checkout. With `RAZORPAY_ENABLED=true` on order-service the real Razorpay test modal opens
instead.

## Changing the UI without a deploy

Admins edit branding, theme, navigation and home-page copy at `/admin/ui-config`, then publish.
If you change the *default* in `backend/config/ui/`, run `npm run ui-config:sync` to refresh
the copy bundled here as the offline fallback.
