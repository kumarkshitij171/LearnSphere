# LearnSphere notification-service

Sends every message LearnSphere sends to a person — email, web/mobile push and SMS. Other
services publish a message to Kafka; this service picks the template, renders it, delivers it,
retries what failed temporarily, and keeps what could not be delivered for an admin to replay.
Spring Boot 4 / Java 21, port `8085`.

> How it is built and why: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

## Prerequisites

- Java 21
- The local stack running: `docker compose up -d` from the repo root (MongoDB, Kafka, Redis)

## Setup

```bash
cp .env.sample .env            # ACCESS_TOKEN_SECRET and INTERNAL_API_KEY must match backend/.env
./mvnw clean install -DskipTests
```

## Run

```bash
./mvnw spring-boot:run         # or `make notification` from the repo root
```

On first start it seeds the bundled email and push templates into MongoDB (never overwriting
ones edited through the API).

## Test

```bash
./mvnw test                    # unit tests + delivery flows on an embedded Kafka broker
NOTIFICATION_IT=true ./mvnw test   # also boots against the real docker compose stack
```

## Sending a notification

Producers publish to the `notifications` topic, keyed by user id:

```json
{
  "notificationId": "o1:receipt",
  "tenantId": "learnsphere",
  "userId": "u1",
  "channels": ["EMAIL", "PUSH"],
  "templateName": "order-receipt",
  "target": { "email": "student@example.com", "phone": null, "deviceTokens": null },
  "variables": { "courseTitle": "Kafka 101", "amount": "₹499.00" },
  "attempt": 0
}
```

Reusing a `notificationId` never sends twice. Bundled templates: `account-activation`,
`order-receipt`, `payment-failed`, `refund-processed`.

## Configuration

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `KAFKA_BROKERS`, `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` | the stack; defaults match docker compose |
| `ACCESS_TOKEN_SECRET`, `INTERNAL_API_KEY` | **required**; same values as the backend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER_EMAIL`, `SMTP_PASSWORD` | email |
| `PUSH_ENABLED`, `FIREBASE_CREDENTIALS` | push: path to a Firebase service-account JSON |
| `SMS_ENABLED`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS |
| `CORS_ALLOWED_ORIGINS` | browser origins allowed to register devices |

A channel that is not enabled records its messages as failed with "no sender registered".

## API

`X-Tenant-Id` is required on everything except `/api/v1/devices`.

| Method | Path | Who |
|---|---|---|
| `POST` / `DELETE` | `/api/v1/devices`, `/api/v1/devices/{token}` | the signed-in user, for their own devices |
| `POST` | `/api/v1/notifications` | admin or internal key — enqueue a message |
| `GET` | `/api/v1/notifications/{id}`, `/api/v1/notifications/user/{userId}` | admin — delivery status |
| `GET` / `POST` | `/api/v1/templates` | admin — list / upsert templates |
| `GET` | `/api/v1/admin/dead-letters` | admin — what could not be delivered |
| `POST` | `/api/v1/admin/dead-letters/{id}/replay` | admin — send it again after a fix |

Metrics: `/actuator/metrics` (`notifications_sent_total`, `notifications_failed_total`,
`notifications_dead_letters_open`, …).
