# LearnSphere order-service

Sells courses: creates orders, takes payment through Razorpay or Stripe (or a mock gateway for
local development), records what was paid, handles refunds, and announces each outcome on Kafka
so enrolment and receipts follow. Spring Boot 4 / Java 21, port `8086`, Postgres schema `orders`.

> How it is built and why: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

## Prerequisites

- Java 21
- The local stack running: `docker compose up -d` (Postgres, Kafka, Redis); Docker is also
  needed for the test suite (Testcontainers)
- The backend running — order-service asks it for course prices

## Setup

```bash
cp .env.sample .env            # ACCESS_TOKEN_SECRET and INTERNAL_API_KEY must match backend/.env
./mvnw clean install -DskipTests
```

## Run

```bash
./mvnw spring-boot:run         # or `make order` from the repo root
```

Flyway creates and migrates the `orders` schema on start.

## Test

```bash
./mvnw test                    # unit tests + an end-to-end run on Testcontainers (needs Docker)
```

## Taking a payment locally

The mock provider is on by default. Create an order, then complete it as the gateway would:

```bash
curl -s localhost:8086/api/v1/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"courseId":"<course id>","provider":"MOCK","idempotencyKey":"'"$(uuidgen)"'"}'
curl -s -X POST localhost:8086/api/v1/mock-gateway/orders/<providerOrderId>/capture
```

`$TOKEN` is the `access_token` cookie from a signed-in browser session.

## Configuration

| Variable | Purpose |
|---|---|
| `SPRING_DATASOURCE_URL` | default `jdbc:postgresql://localhost:5434/testDB?currentSchema=orders` |
| `ACCESS_TOKEN_SECRET`, `INTERNAL_API_KEY` | **required**; same values as the backend |
| `CATALOGUE_BASE_URL` | the backend, default `http://localhost:5000` |
| `KAFKA_BROKERS`, `REDIS_HOST` | the stack |
| `MOCK_PAYMENTS_ENABLED` | mock gateway, `true` locally — refuses to start in the `prod` profile |
| `RAZORPAY_ENABLED`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay |
| `STRIPE_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `CORS_ALLOWED_ORIGINS` | the frontend origin |

Point each provider's dashboard webhook at `/api/v1/webhooks/razorpay` or `/api/v1/webhooks/stripe`.

## API

| Method | Path | Who |
|---|---|---|
| `POST` | `/api/v1/orders` | buyer — create (idempotent per `idempotencyKey`) |
| `GET` | `/api/v1/orders`, `/api/v1/orders/{id}` | buyer — history, status |
| `POST` | `/api/v1/orders/{id}/cancel`, `/api/v1/orders/{id}/retry` | buyer |
| `GET` | `/api/v1/orders/providers` | which payment methods are on |
| `POST` | `/api/v1/webhooks/{provider}` | the payment provider (signature-checked) |
| `GET` | `/api/v1/admin/orders` | admin — search |
| `POST` | `/api/v1/admin/orders/{id}/refund` | admin — full or partial refund |

Kafka: publishes `order.paid`, `order.failed`, `order.refunded`, and receipts on `notifications`.
