# CLAUDE.md — notification-service

Spring Boot 4.0.3 / Java 21 service that owns every outbound message LearnSphere
sends to a human. Port `8085`. Read the root `CLAUDE.md` alongside this file — in
particular **Ways of Working**: HLD and LLD are discussed and agreed before
implementation, and implementation lands in numbered phases.

## Read `SYSTEM_DESIGN.md` first

`SYSTEM_DESIGN.md` in this folder is the **plan of record** — architecture,
decisions and their rationale, data model, contracts, and the numbered phase
plan. Consult it before changing anything here, and update it when a design
decision changes. `todo.md` is the original brain-dump that seeded it; where the
two disagree, `SYSTEM_DESIGN.md` wins.

Work proceeds phase by phase per §12 of that document. Do not jump ahead to a
later phase's concerns while an earlier one is unverified.

## Commands

```
./mvnw spring-boot:run      # run (or `make notification` from the repo root)
./mvnw test
./mvnw clean package
./mvnw compile
```

Infra first: `docker compose up -d` from the repo root supplies Mongo (`27017`),
Kafka (`9092`) and Redis (`6379`). Mongo UI on `8081`, Kafka UI on `8080`.

## Architecture in one paragraph

Kafka is the primary inbound path (topic `notifications`); the REST API is a
convenience that **publishes to that same topic** rather than sending inline, so
there is one pipeline with one set of semantics. One message names one or more
channels and fans out inside the service. Templates live in Mongo so content
edits ship without a redeploy. Each `(notificationId, channel)` gets its own
`notifications` row, because "email sent, push failed" is a real outcome.

## The channel abstraction — do not bypass it

Everything channel-specific sits behind `channel/ChannelSender`:

```java
ChannelType channel();
SendResult  send(Notification n, NotificationTarget target, RenderedContent content);
String      resolveTarget(NotificationTarget target);
```

`ChannelSenderRegistry` collects Spring's injected `List<ChannelSender>` into an
`EnumMap`. The orchestrator only ever asks the registry for a channel — it never
references a concrete sender.

**Adding a channel (SMS, webhook) is exactly three things**: a `@Component`
implementing `ChannelSender`, the provider dependency and config, and a template
row for that channel. Nothing in the orchestrator, listener, schema or any
producer changes. If a change to a channel requires touching
`NotificationService`, the abstraction is being bypassed — reconsider.

`ChannelType` carries `EMAIL, PUSH, SMS, WEBHOOK` from day one, so a producer can
request a channel before its sender exists; that records a `PERMANENT` "no sender
registered" failure rather than crashing.

## Conventions specific to this service

- **Multi-tenancy is not optional.** `NotificationApiFilter` requires
  `x-tenant-id` on every `/api` request and stashes it in the `ThreadLocal`
  `NotificationContextHolder`, cleared in a `finally`. Kafka messages carry
  `tenantId` in the payload instead. **Every Mongo query is scoped by
  `tenantId`** — templates, history, device tokens. No exceptions.
- **Errors are classified `TRANSIENT` or `PERMANENT`** (`ErrorType`). A missing
  template, an unrenderable placeholder, a malformed address or a rejected
  credential is permanent and must not be retried. Anything that could succeed
  on a second attempt is transient. Getting this wrong either loses messages or
  floods the DLQ.
- **Never block the consumer to wait out a backoff.** No `Thread.sleep` in the
  listener path; retries go to the `notifications_retry-N` topics, then `notifications_dlq`.
- **Idempotency fails open.** If Redis is unavailable the send proceeds — a
  duplicate email beats a missing one.
- **Entities extend `AbstractEntity`**; call `entityCreate()` on insert and
  `entityUpdate()` on modify. Timestamps are epoch millis, not `Instant`.
- **Exceptions implement `AbstractException`** and are rendered by
  `GlobalExceptionHandler` (`@RestControllerAdvice`).
- Template rendering is deliberately plain `{{variable}}` substitution — no
  Thymeleaf, no EJS. An unresolved placeholder is a permanent error, never a
  literal `{{name}}` mailed to a user.
- `NotificationMessage` is a published contract other services code against.
  It is **additive-only**: new optional fields are fine, renaming or removing
  one breaks every producer.

## Configuration

Everything is env-overridable with local-dev defaults matching the root
`docker-compose.yml` — see §10 of `SYSTEM_DESIGN.md`. SMTP: `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER_EMAIL`, `SMTP_PASSWORD`. In `.env`, leave a key **commented out** rather than
empty: an empty value overrides the default (an empty `SMTP_USER_EMAIL` blanks the sender).
Mongo's URI key is `spring.mongodb.uri` in Boot 4 — the old `spring.data.mongodb.uri` is
silently ignored.

## Tests

`./mvnw test`: unit tests plus `DeliveryFlowIntegrationTest` on an embedded Kafka (68, one
gated). `NOTIFICATION_IT=true ./mvnw test` also boots the app against the docker compose stack.

## Comments

Minimal, generic, to the point. One short line explaining *why* beats a block
restating *what*. No Javadoc on self-explanatory methods.
