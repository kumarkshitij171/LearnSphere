# LearnSphere — LMS

A learning-management platform for video courses: instructors create courses and upload videos that are transcoded to adaptive HLS; students enroll and watch. Built as a polyglot monorepo with role-based access control (student / instructor / admin).

![Frontend UI](FrontendUI.jpg)

## Architecture

| Service | Stack | Port | Role |
|---|---|---|---|
| `frontend/` | Next.js 14 (App Router), Tailwind | 3000 | Web UI |
| `backend/` | Express + TypeScript, Prisma | 5001 | REST API, auth, RBAC, courses, presign |
| `video-transcoder/` | Node + TypeScript (pnpm), FFmpeg | 7000 | Kafka consumer → HLS transcoding |
| `notification-service/` | Spring Boot 4 / Java 21 | 8085 | Notifications (early scaffold) |

Services share one Postgres DB and communicate over Kafka. Object storage is S3 — **LocalStack** locally, real AWS in production (toggled by `LOCAL_STACK_DATA_SOURCE`).

## Prerequisites

- **Node.js 22+** and **npm**
- **pnpm** (for the transcoder): `npm i -g pnpm`
- **Docker** + Docker Compose (Postgres, Redis, Kafka, LocalStack, Mongo)
- **FFmpeg** (transcoder): `brew install ffmpeg`
- **Java 21** + Maven wrapper (only for the notification service)

## Quick start

```bash
# 1. Start local infrastructure (Postgres, Redis, Kafka, LocalStack, Mongo)
make infra

# 2. Configure backend env
cp backend/.env.sample backend/.env      # then edit secrets/SMTP as needed

# 3. Install deps
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd video-transcoder && pnpm install && cd ..

# 4. Sync the database schema + generate Prisma clients
cd backend && npx prisma db push && npx prisma generate && cd ..
cd video-transcoder && npx prisma generate && cd ..

# 5. Run everything
make start
```

Open http://localhost:3000.

### `make` commands

```bash
make start                                # infra + backend + frontend + transcoder
make start SERVICES="backend frontend"    # only the listed services
make infra | localstack | backend | frontend | transcoder | notification
make stop | restart | logs | ps
make help
```

`make start` runs the selected services together under one process group — `Ctrl-C` stops them all.

## Environment

All backend config lives in `backend/.env` (copy from `backend/.env.sample`). Key variables:

- **Auth**: `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `ACCESS_TOKEN_EXPIRY` (5m), `REFRESH_TOKEN_EXPIRY` (7d), `BCRYPT_PEPPER`, `CLIENT_URL`
- **Email (OTP verification)**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER_EMAIL`, `SMTP_PASSWORD`, `SMTP_SERVICE`
- **AWS / S3**: `LOCAL_STACK_DATA_SOURCE=true` → use LocalStack (`LOCALSTACK_ENDPOINT`, default creds `test`/`test`); `false` → real AWS (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`). `S3_RAW_VIDEO_BUCKET`, `PRESIGNED_URL_EXPIRY`
- **Kafka**: `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`
- **Transcoder callback**: `TRANCODER_API_KEY` (must match the value in the video-transcoder env)

The frontend reads `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:5001`) and `NEXT_PUBLIC_TRANSCODER_URL`. The transcoder copies `video-transcoder/.env.example` → `.env`.

## Database

Backend and video-transcoder each keep their own `prisma/schema.prisma` pointed at the **same** Postgres DB — keep the shared models in sync. After editing a schema:

```bash
cd backend && npx prisma db push && npx prisma generate
cd ../video-transcoder && npx prisma generate
```

The data model includes `User` (with a `Role` enum: `STUDENT | INSTRUCTOR | ADMIN`), `Course`, `Video`, `Enrollment`, and `InstructorRequest`.

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
| http://localhost:5001 | Backend API (`/api/v1`) |
| http://localhost:4566 | LocalStack (S3/SQS/SNS) |
| http://localhost:5050 | pgAdmin · http://localhost:5540 RedisInsight |
| http://localhost:8080 | Kafka UI · http://localhost:8081 Mongo Express |

## Technologies

Next.js · Express · TypeScript · Prisma · PostgreSQL · Kafka · FFmpeg/HLS · Redis · LocalStack/AWS S3 · Spring Boot

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss what you'd like to change.
