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

The frontend reads `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_TRANSCODER_URL`. The transcoder copies `video-transcoder/.env.sample` → `.env`.

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

`backend/` and `video-transcoder/` currently each keep a `prisma/schema.prisma` pointed at the **same** database, so shared models must be edited in **both** files:

```bash
cd backend && npm run db:migrate:deploy && npx prisma generate
cd ../video-transcoder && npx prisma generate
```

> Schema changes ship as **migrations** (`backend/prisma/migrations/`, baseline `0_init`): `npm run db:migrate -- --name <change>` creates one locally, `npm run db:migrate:deploy` applies them in CI/production. An existing database built with `db push` is adopted once with `npx prisma migrate resolve --applied 0_init` (`DATABASE_DESIGN.md` §8.2).
>
> `npx prisma generate` must run **before `npm test`** in `backend/`, or `@prisma/client` ships stub types and every suite importing a route fails to *compile*.

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

`presign` (instructor, owns course) → `PUT` file directly to S3 → `confirm` (saves `Video`, publishes a Kafka `video.uploaded` event) → transcoder consumes, produces HLS, calls back `/:videoId/processed` → status `READY` → enrolled students stream via the HLS player.

## Tests

```bash
cd backend && npm test            # Jest: auth, RBAC, courses, video upload, services
npm run test:coverage
```

## Local service URLs

| URL | What |
|---|---|
| http://localhost:3000 | Frontend |
| http://localhost:5000 | Backend API (`/api/v1`) |
| http://localhost:7000 | video-transcoder (HLS + `/health`) |
| http://localhost:4566 | LocalStack (S3/SQS/SNS) |
| http://localhost:8080 | Kafka UI · http://localhost:8081 Mongo Express |
| http://localhost:5540 | RedisInsight |
| `docker exec -it postgres_db psql -U testUser -d testDB` | Postgres (no web UI — see [Database](#database)) |

## Technologies

Next.js · Express · TypeScript · Prisma · PostgreSQL · Kafka · FFmpeg/HLS · Redis · LocalStack/AWS S3 · Spring Boot

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss what you'd like to change.
