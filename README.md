# LearnSphere — LMS

A learning-management platform for video courses: instructors create courses and upload videos that are transcoded to adaptive HLS; students enroll and watch. Built as a polyglot monorepo with role-based access control (student / instructor / admin).

![Frontend UI](FrontendUI.jpg)

## Architecture

| Service | Stack | Port | Role |
|---|---|---|---|
| `frontend/` | Next.js 14 (App Router), Tailwind | 3000 | Web UI |
| `backend/` | Express + TypeScript, Prisma | 5000 | REST API, auth, RBAC, courses, presign, internal API |
| `video-transcoder/` | Node + TypeScript, FFmpeg | 7000 | Kafka consumer → HLS transcoding, HLS passthrough |
| `order-service/` | Spring Boot 4 / Java 21 | 8086 | Orders, payments (Razorpay, Stripe, mock), refunds |
| `notification-service/` | Spring Boot 4 / Java 21 | 8085 | Email, push and SMS delivery |

Services share one Postgres instance — **one schema per service** — and communicate over Kafka. Object storage is S3 — **LocalStack** locally, real AWS in production (toggled by `LOCAL_STACK_DATA_SOURCE`).

## What's in the app

- **Design.** The *Studio* design language: light by default, with one highlighter-yellow accent marking "you are here". Every viewer can switch **Light / Dark / System** from the account menu or the moon icon; the video player is always dark. The design is in `frontend/SYSTEM_DESIGN.md` Part VIII.
- **Config-driven UI.** Admins edit branding, theme (`mode`, `highlight`, `radius`), navigation, landing-page and sign-in copy, feature toggles and an announcement at `/admin/ui-config`. Versions are kept, so any publish can be rolled back.
- **Learning.** The dashboard shows *Continue* (resume to the second), a *This week* panel (watch time, kept per browser) and course progress. Lessons stream as adaptive HLS up to 4K, with YouTube's keyboard shortcuts.
- **Teaching.** In Studio, instructors create a course, upload lessons and publish once the checklist passes. They can upload a **thumbnail** per course and per lesson. Without one, a lesson's cover is a frame the transcoder picks at a random point in the video, and a course uses its first lesson's frame.
- **Buying.** Courses are sold per course through order-service (mock, Razorpay or Stripe), with email receipts and a purchase history.
- **Notifications.** The bell opens an **in-app inbox**. Browser push (FCM) is supported once Firebase is configured (see [Environment](#environment)).

### Design documents

The architecture is written down next to the code. Read these before changing anything:

| Document | Covers |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System-wide boundaries, current vs target topology, the technology roadmap, the scaling plan |
| [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) | Data ownership, schema boundaries, money representation, migrations, retention |
| `<service>/SYSTEM_DESIGN.md` | One per service: HLD, LLD and a numbered phase plan |
| [`docs/diagrams/`](docs/diagrams) | Diagram-as-code sources, rendered in the shared Eraser workspace |

## Prerequisites

- **Node.js 22+** and **npm**
- **Docker** + Docker Compose (Postgres, Redis, Kafka, LocalStack, Mongo)
- **`psql`** (optional, for host-side database access — `brew install libpq`)
- **FFmpeg** (transcoder): `brew install ffmpeg`
- **Java 21** (order-service and notification-service use the bundled Maven wrapper)

## Quick start

```bash
# 1. Start local infrastructure (Postgres, Redis, Kafka, LocalStack, Mongo)
make infra

# 2. Configure each service — the samples match docker-compose.yml
cp backend/.env.sample backend/.env
cp frontend/.env.sample frontend/.env.local
cp video-transcoder/.env.sample video-transcoder/.env
cp order-service/.env.sample order-service/.env
cp notification-service/.env.sample notification-service/.env

# 3. Install every service's dependencies (npm, Maven) and generate Prisma clients
make install

# 4. Create the backend tables
cd backend && npm run db:migrate:deploy && cd ..

# 5. Run everything
make start
```

Open http://localhost:3000. Each service's own README covers running and configuring it alone.

### `make` commands

```bash
make start                                # infra + all five services
make start SERVICES="backend frontend"    # only the listed services
make install                              # every service's dependencies
make test                                 # every service's test suite
make infra | localstack | backend | frontend | transcoder | order | notification
make stop | restart | logs | ps
make help
```

`make start` runs the selected services together under one process group — `Ctrl-C` stops them all.

## Environment

All backend config lives in `backend/.env` (copy from `backend/.env.sample`). Key variables:

- **Auth**: `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRY` (5m), `REFRESH_TOKEN_EXPIRY` (7d), `BCRYPT_PEPPER`, `CLIENT_URL`
- **Email**: the backend sends none itself — it publishes to the Kafka `notifications` topic (`KAFKA_TOPIC_NOTIFICATIONS`, `TENANT_ID`) and `notification-service` delivers. SMTP settings live in `notification-service/.env`.
- **AWS / S3**: `LOCAL_STACK_DATA_SOURCE=true` → use LocalStack (`LOCALSTACK_ENDPOINT`, default creds `test`/`test`); `false` → real AWS (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`). `S3_RAW_VIDEO_BUCKET`, `PRESIGNED_URL_EXPIRY`
- **Kafka**: `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`
- **Transcoder callback**: `TRANCODER_API_KEY` (must match the value in the video-transcoder env)

- **Course and lesson images**: `S3_ASSET_BUCKET` (default `course-assets`; created automatically on LocalStack)

The frontend reads `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_TRANSCODER_URL`, `NEXT_PUBLIC_ORDER_API_URL` and `NEXT_PUBLIC_NOTIFICATION_API_URL` (all in `frontend/.env.local`). The transcoder copies `video-transcoder/.env.sample` → `.env`.

**Browser push (optional).** Off until a Firebase project exists:
1. **Frontend:** set `NEXT_PUBLIC_FIREBASE_API_KEY`, `_PROJECT_ID`, `_MESSAGING_SENDER_ID`, `_APP_ID` and `_VAPID_KEY` in `frontend/.env.local`.
2. **notification-service:** set `PUSH_ENABLED=true` and `FIREBASE_CREDENTIALS=<path to service-account JSON>` in `notification-service/.env`.

Without them, the bell's inbox still works and shows "Browser push · Not set up yet".

> **Known port mismatch — set these explicitly.** The services and the frontend disagree about their own defaults: `backend` defaults to `5000` while the frontend's `NEXT_PUBLIC_API_BASE_URL` defaults to `5001`, and the transcoder defaults to `7000` while `NEXT_PUBLIC_TRANSCODER_URL` defaults to `7070`. It only works because the env vars are normally set. Tracked in `ARCHITECTURE.md` §9 — until it is settled, set both variables rather than relying on a default.

## Database

One Postgres 15 instance (`testDB`), published on host port **5434**. Data is laid out **one schema per service** so a schema can be promoted to its own instance later with only a connection-string change:

| Schema | Owner | Managed by |
|---|---|---|
| `public` | `backend/` — `User`, `Course`, `Enrollment`, `InstructorRequest`, `Video`, `VideoTranscodeJob` | Prisma migrations |
| `orders` | `order-service` — orders, payments, refunds, outbox, webhook events, audit | Flyway |

MongoDB belongs to `notification-service` (templates, the delivery ledger, device tokens). Redis is shared but namespaced by prefix and holds **nothing** that correctness depends on.

**The ownership rule: one writer per table.** A service that needs someone else's data gets an API call or a Kafka event, never a connection string. The full picture — table-by-table columns, indexes, money representation, retention and the migration plan — is in [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md).

### Changing the schema

Only `backend/` has a Prisma schema; the transcoder reports through the backend's callback and never touches the database. To change a model:

```bash
cd backend
# edit prisma/schema.prisma, then:
npm run db:migrate -- --name add_something   # writes prisma/migrations/<ts>_add_something and applies it locally
npm run db:migrate:status                    # what is applied where
npm run db:migrate:deploy                    # CI / production: apply pending migrations only
```

> Schema changes ship as **migrations** (`backend/prisma/migrations/`, baseline `0_init`): `npm run db:migrate -- --name <change>` creates one locally, `npm run db:migrate:deploy` applies them in CI/production. An existing database built with `db push` is adopted once with `npx prisma migrate resolve --applied 0_init` (`DATABASE_DESIGN.md` §8.2).
>
> `npx prisma generate` must run **before `npm test`** in `backend/`, or `@prisma/client` ships stub types and every suite importing a route fails to *compile*.

### UI configuration

The published UI config lives in Postgres as numbered versions. An empty database is seeded from `backend/config/ui/ui-config.default.json` on boot. When a release changes that default (as the v2 schema did), publish it as a new version:

```bash
cd backend && npm run ui-config:publish-default -- "why it changed"
```

This command is idempotent. An older stored document is upgraded on read by `config/ui/migrations.ts`, which keeps every field an admin changed.

### Inspecting the database

There is **no pgAdmin container** — it was removed in favour of talking to Postgres directly, which is faster, scriptable and does not need a second credential set to remember.

```bash
# interactive shell
docker exec -it postgres_db psql -U testUser -d testDB

# one-off query
docker exec postgres_db psql -U testUser -d testDB -c '\dt'

# from the host, if you have psql installed
psql postgresql://testUser:mysecretpassword@localhost:5434/testDB
```

Useful once you are in: `\dt` list tables · `\d "User"` describe a table (quote the CamelCase names Prisma creates) · `\dn` list schemas · `\q` quit.

Prefer a GUI? Point any Postgres client (DataGrip, TablePlus, DBeaver, the VS Code
PostgreSQL extension) at `localhost:5434`, database `testDB`, user `testUser`,
password `mysecretpassword`. Prisma also ships one with no setup:

```bash
cd backend && npx prisma studio      # browses the schema it manages, on :5555
```

Mongo and Redis keep their web UIs (`:8081` and `:5540`) because neither has an
equivalent one-line shell.

## Roles & access (RBAC)

- New signups are **students**. They request instructor access; an **admin** approves it (which promotes them to `INSTRUCTOR`). Admins have every permission.
- Instructors create/own courses and upload videos to their own courses; students enroll (free) and watch.
- **Bootstrapping an admin**: promote a user directly in the DB:
  ```bash
  docker exec postgres_db psql -U testUser -d testDB \
    -c "UPDATE \"User\" SET role='ADMIN' WHERE email='you@example.com';"
  ```
  Role changes apply on the user's next token refresh (≤ access-token TTL).

## Video upload flow

1. **Presign:** an instructor who owns the course requests an upload URL.
2. **Upload:** the browser PUTs the file directly to S3.
3. **Confirm:** the backend saves the `Video` row and publishes a Kafka `video.uploaded` event.
4. **Transcode:** the transcoder consumes the event, probes the source and encodes an HLS ladder (up to 2160p, never upscaled). It writes a `poster.jpg` from a seeded random point in the video, then calls back `/:videoId/processed`.
5. **Watch:** the status becomes `READY` and enrolled students stream it in the player.

Thumbnails follow the same direct-to-S3 pattern: `POST …/thumbnail/presign` → PUT → `PUT …/thumbnail {key}`, for `/courses/:id` and `/video-upload/:videoId`. Images are served by a public `GET …/thumbnail` redirect.

## Tests

```bash
make test                                      # every suite below
cd backend && npm test                         # Jest (run `npx prisma generate` first)
cd video-transcoder && npm test                # node:test
cd order-service && ./mvnw test                # Testcontainers test skips without Docker
cd notification-service && ./mvnw test
cd frontend && npx vitest run && npm run lint  # lint includes scripts/check-styles.mjs
```

`check-styles` fails the lint if the old generated look returns: raw palette colours, blur, gradient backgrounds, oversized radii or the removed effect utilities.

**Local test accounts.** Keep personal test logins in `.local/` at the repo root and add it to `.git/info/exclude` so it is never committed. SMTP is usually off locally, so signup OTPs can be read from the Kafka topic: `docker exec kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic notifications --from-beginning`.

## Local service URLs

| URL | What |
|---|---|
| http://localhost:3000 | Frontend |
| http://localhost:5000 | Backend API (`/api/v1`) |
| http://localhost:7000 | video-transcoder (HLS + `/health`) |
| http://localhost:8086 | order-service (`/api/v1/orders`, `/actuator/health`) |
| http://localhost:8085 | notification-service (`/api/v1/notifications`, inbox, devices) |
| http://localhost:4566 | LocalStack (S3/SQS/SNS) |
| http://localhost:8080 | Kafka UI · http://localhost:8081 Mongo Express |
| http://localhost:5540 | RedisInsight |
| `docker exec -it postgres_db psql -U testUser -d testDB` | Postgres (no web UI — see [Database](#database)) |

## Technologies

Next.js · Express · TypeScript · Prisma · PostgreSQL · Kafka · FFmpeg/HLS · Redis · LocalStack/AWS S3 · Spring Boot

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss what you'd like to change.
