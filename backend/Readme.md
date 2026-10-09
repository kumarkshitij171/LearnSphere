# LearnSphere backend

The core REST API: sign-up and login, courses and enrolment, video upload intake, the admin
console's endpoints, and the UI configuration the frontend renders from. Express + TypeScript +
Prisma on Postgres, port `5000`.

It sends **no email itself** — it publishes notification messages to Kafka and
`notification-service` delivers them.

> How it is built and why: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

## Prerequisites

- Node.js 22+ and npm
- The local stack running: `docker compose up -d` from the repo root (Postgres, Redis, Kafka, LocalStack)

## Setup

```bash
npm install
cp .env.sample .env            # the defaults match docker-compose.yml
npx prisma db push             # create / update the tables
npx prisma generate            # generate the typed client
```

Or `make install` from the repo root to install every service at once.

## Run

```bash
npm run dev                    # http://localhost:5000/api/v1/health
npm run debug                  # same, with the Node inspector on :9229
```

The server refuses to start without `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`
and `CLIENT_URL`.

## Test

```bash
npm test                       # Jest: unit + route-level integration tests
npm run test:coverage
```

Prisma is mocked, so tests need no database — but `npx prisma generate` must have run.

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (`localhost:5434` with docker compose) |
| `PORT` | HTTP port, default `5000` |
| `CLIENT_URL` | the frontend origin, for CORS and links in emails |
| `JWT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` | token signing; the access secret is shared with order-service and notification-service |
| `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY` | default `5m` / `7d` |
| `REDIS_URI` | Redis, for OTPs and sessions |
| `KAFKA_BROKERS` | default `localhost:9092` |
| `KAFKA_TOPIC_NOTIFICATIONS`, `TENANT_ID` | where activation emails are published; default `notifications` / `learnsphere` |
| `LOCAL_STACK_DATA_SOURCE` | `true` = LocalStack S3, `false` = real AWS |
| `S3_RAW_VIDEO_BUCKET`, `PRESIGNED_URL_EXPIRY` | video upload bucket and presign lifetime |
| `INTERNAL_API_KEY` | guards `/api/v1/internal/*` (order-service calls these) |
| `TRANCODER_API_KEY` | guards the transcoder's callback (the spelling is deliberate — match it) |

## API at a glance

All under `/api/v1`.

| Area | Routes |
|---|---|
| Auth | `POST /users/register`, `POST /users/verify`, `GET /users/reverify-email`, `POST /users/login`, `POST /users/refresh-token`, `GET /users/me`, `GET /users/logout` |
| Courses | `GET /courses`, `GET /courses/mine`, `GET /courses/enrolled`, `GET /courses/:id`, `POST /courses`, `PATCH /courses/:id`, `DELETE /courses/:id`, `POST /courses/:id/enroll` (instructor/admin grant) |
| Video | `POST /video-upload/presign`, `POST /video-upload`, `GET /video-upload/:id`, `PATCH`/`DELETE /video-upload/:id` |
| Instructor requests | `POST /instructor-requests`, `GET /instructor-requests/me` |
| Admin | `/admin/users`, `/admin/instructor-requests`, `/admin/ui-config/*` |
| UI config | `GET /ui-config` (public) |
| Service-to-service | `/internal/*` (API key), `POST /video-upload/:id/processed` (transcoder key) |

Kafka: publishes `video.uploaded` and `notifications`; consumes `order.paid` and `order.refunded`
to grant and revoke enrolment.

## Useful scripts

```bash
npm run ui-config:export       # write the live UI config back to config/ui/ui-config.default.json
```

## Making yourself an admin

```bash
docker exec postgres_db psql -U testUser -d testDB \
  -c "UPDATE \"User\" SET role='ADMIN' WHERE email='you@example.com';"
```

The new role applies at your next token refresh (within five minutes).
