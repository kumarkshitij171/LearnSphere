# Notification Service

A scalable, event‑driven **notification microservice** built with **Spring Boot**, **Kafka**, **MongoDB**, **Redis**, and **Prometheus/Grafana**.  
It is designed to fit into a microservice architecture and scale horizontally to very high traffic.

---

## 1. Core Responsibilities

- Receive notification requests (email, SMS, push, webhooks) from other services.
- Process notifications **asynchronously** via Kafka.
- Apply **rate limiting**, **idempotency**, and **retry with backoff**.
- Forward failed messages to a **dead‑letter queue (DLQ)**.
- Store notification history & templates in MongoDB.
- Expose **metrics** for monitoring and capacity planning.

---

## 2. Microservice Architecture & Boundaries

- **Single responsibility**: This service only handles notification orchestration & delivery.  
  It does **not** manage user profiles, auth, or business logic outside notifications.

- **Communication style**:
  - **Inbound**:  
    - Kafka topic `notifications` (main integration path).  
    - Optional REST API `/notifications` for synchronous producers.
  - **Outbound**:
    - Kafka topics `notifications_retry`, `notifications_dlq`.
    - HTTP calls to provider APIs (email, SMS, webhooks).

- **Scalability**:
  - Stateless instances (no local state between requests).  
  - Horizontal scaling by adding more instances to the Kafka consumer group.  
  - Shared state (rate limits, idempotency) stored in **Redis**.  
  - Durable state stored in **MongoDB**.

- **Loose coupling**:
  - Other microservices only depend on **Kafka contracts** (message schema) and/or REST contract.
  - Provider implementations are isolated behind channel interfaces.

---

## 3. High‑Level Design

### 3.1 Data Flow

1. **Producer service** publishes a `NotificationMessage` to Kafka topic `notifications`.
2. **Notification Service** consumes the message:
   - Validates schema (channel, target, payload, templateId, etc.).
   - Checks **rate limits** and **idempotency** in Redis.
   - Loads **template** from MongoDB and renders content.
3. A **channel‑specific sender** sends the message:
   - Email → email provider.
   - SMS → SMS provider.
   - Webhook → external HTTP endpoint.
4. The result is persisted in MongoDB, and metrics are updated.
5. On **transient error** → message is scheduled on `notifications_retry`.
6. On **permanent error** or **retries exhausted** → message is written to `notifications_dlq`.

### 3.2 Kafka Topics

- `notifications` – main topic for new notifications.
- `notifications_retry` – retry topic with backoff metadata.
- `notifications_dlq` – dead‑letter topic for analysis & manual replay.

---

## 4. Domain Model (High‑Level)

### 4.1 Enums

- `ChannelType` – `EMAIL`, `SMS`, `PUSH`, `WEBHOOK`
- `NotificationStatus` – `PENDING`, `SENT`, `FAILED`, `RETRYING`
- `ErrorType` – `TRANSIENT`, `PERMANENT`, `EXHAUSTED_RETRIES`

### 4.2 Mongo Collections

- `notifications`:
  - `notificationId`, `tenantId`, `userId`
  - `channel`, `target`, `templateId`
  - `payload` (template variables and/or rendered content)
  - `status`, `attempts`, `provider`, `providerMessageId`
  - `errorType`, `errorMessage`
  - `createdAt`, `updatedAt`

- `templates`:
  - `templateId`, `channel`
  - `subject`, `bodyHtml`, `bodyText`
  - `webhookPayloadTemplate`
  - `version`, `active`

---

## 5. Technology Stack

- **Language / Framework**: Java 17, Spring Boot 3.x
- **Messaging**: Apache Kafka (Spring Kafka)
- **Database**: MongoDB (Spring Data Mongo)
- **Cache / Rate Limiting / Idempotency**: Redis (Spring Data Redis)
- **Metrics & Monitoring**:
  - Spring Boot Actuator
  - Micrometer Prometheus registry
  - Prometheus + Grafana dashboards
- **Logging**: Log4j2 / JSON logs (ready for ELK / cloud logging)
- **Build**: Maven

---

## 6. Microservice Modules (Packages)

- `config`  
  Application configuration: Kafka, Mongo, Redis, HTTP clients, metrics, logging.

- `domain`  
  Core domain models: `NotificationMessage`, `ChannelType`, `NotificationStatus`, `ErrorType`, etc.

- `kafka`  
  Kafka listeners and producers:
  - `NotificationListener` (consumes `notifications`, `notifications_retry`)
  - DLQ producer for `notifications_dlq`.

- `service`  
  - `NotificationService` – orchestrates validation, template rendering, dispatch, and retry logic.
  - `RetryService` – handles backoff and publishing to retry topic.

- `channel`  
  Channel‑specific senders:
  - `EmailSender`
  - `SmsSender`
  - `WebhookSender`  
  All implement a common `ChannelSender` interface.

- `repository`  
  Spring Data Mongo repositories:
  - `NotificationRepository`
  - `TemplateRepository`

- `api` (optional)  
  REST endpoints for:
  - Submitting notifications (if not only Kafka‑driven).
  - Searching notification history.
  - DLQ replay / inspection (admin only).

---

## 7. Scalability & Resilience Patterns

- **Horizontal scaling**: run multiple instances; they join the same Kafka consumer group.
- **Backpressure**:
  - Tune `max.poll.records`, listener concurrency, provider timeouts.
  - Use retry topic to smooth out spikes instead of hammering providers.
- **Retries & DLQ**:
  - Classify errors as `TRANSIENT` or `PERMANENT`.
  - Limit max attempts; send to DLQ when exhausted.
- **Circuit Breakers (optional)**:
  - Use Resilience4j for provider calls to prevent cascading failures.

---

## 8. Observability

- **Metrics** (Prometheus/Micrometer):
  - `notifications_received_total{channel, tenant}`
  - `notifications_sent_total{channel, provider}`
  - `notifications_failed_total{channel, errorType}`
  - `notifications_dlq_total{channel, errorType}`
  - Latency histograms: send time & end‑to‑end time.

- **Dashboards** (Grafana):
  - Per‑channel success rate.
  - DLQ volume over time.
  - Latency (P50/P95/P99) and error distribution.

- **Logs**:
  - Structured logs with `notificationId`, `correlationId`, `channel`, `tenantId`, `provider`.
  - Ready to integrate with ELK / cloud logging.

- **Tracing** (optional but recommended):
  - OpenTelemetry tracing across producers, notification-service, and downstream providers.

---

## 9. Local Development

- **Prerequisites**:
  - Java 17+
  - Docker & docker‑compose (for Kafka, Mongo, Redis, Prometheus, Grafana)

- **Suggested docker‑compose services**:
  - `kafka` + `zookeeper` (or KRaft broker)
  - `mongo`
  - `redis`
  - `prometheus`
  - `grafana`

- **Spring profiles**:
  - `local`: services at `localhost` (9092, 27017, 6379, etc.).
  - `prod`: services discovered via env/config server.

---

## 10. Extension Points

- **Add new channels**:
  - Implement `ChannelSender` and register it in a factory or using Spring’s `@Component` scanning.
- **Swap providers**:
  - Use configuration (YAML/env) to select provider implementation per channel/tenant.
- **Per‑tenant logic**:
  - Look up provider configs and rate limits by `tenantId`.

---