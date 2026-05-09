# LMS 
## Context

The LMS is feature-complete at the backend level (Phases 1–8) but built for single-node local dev. The goal is to scale it to 100k+ concurrent users on AWS without rewriting business logic — only adding infra layers and cross-cutting concerns on top of what already exists.

**Decisions locked in via planning session:**
- Deployment: AWS EKS
- Real-time notifications: WebSocket via NestJS @WebSocketGateway (socket.io 4.8.3 already installed)
- Kafka: keep single broker for now (MSK migration deferred)
- Search: AWS OpenSearch (Elasticsearch)
- State management: keep Redux Toolkit (no migration)
- Video CDN: CloudFront Signed URLs (15-min TTL, same as current S3)
- Rate limiting: Redis sliding window (cross-pod safe)
- Monitoring: Prometheus + Grafana on EKS

---

## What Does NOT Change

- Prisma schema and DB migrations
- All existing API endpoints and business logic
- Auth flow (JWT + Redis sessions)
- Stripe payment flow
- Spring Boot notification service (stays as Kafka consumer + email sender)
- Frontend Redux store (authSlice stays)
- Kafka topics and payloads

---

## Tech Stack Assessment

| Component | Current | Production | Change? |
|---|---|---|---|
| Backend | NestJS single instance | NestJS on EKS (2–10 pods) | Scale out |
| Frontend | Next.js single instance | Next.js standalone on EKS | Dockerfile + standalone mode |
| Video Transcoder | Node.js single instance | Node.js on EKS (1–4 pods) | Dockerfile + system FFmpeg |
| Notification Service | Spring Boot single instance | Spring Boot on EKS | Dockerfile |
| PostgreSQL | Local Docker | RDS PostgreSQL 15 Multi-AZ | Managed service |
| Redis | Local Docker | ElastiCache Redis 7 | Managed service |
| Kafka | Single-broker KRaft Docker | Self-managed on EKS → MSK later | No change yet |
| MongoDB | Local Docker | DocumentDB or MongoDB Atlas | Managed service |
| S3 / MinIO | MinIO local | Amazon S3 (remove endpoint override) | No code change |
| Video delivery | S3 presigned URLs | CloudFront Signed URLs | URL generation logic |
| Search | PostgreSQL ILIKE | AWS OpenSearch | New NestJS module |
| Rate limiting | In-memory NestJS ThrottlerModule | Redis sliding window | Replace entirely |
| Monitoring | None | Prometheus + Grafana on EKS | Brand new |

**The Spring Boot notification service stays.** Java is excellent for long-lived Kafka consumer processes. It needs a Dockerfile but keeps all its current responsibilities: Kafka consumption, MongoDB storage, Redis unread count, Redis Pub/Sub publish, email sending.

---

## Priority 1: Redis Caching Layer

**Why first:** Zero infrastructure changes needed. Purely application code. Eliminates the heaviest DB queries and gives the highest ROI immediately.

### Files to Modify

- `backend/src/courses/courses.service.ts`
- `backend/src/categories/categories.service.ts`
- `backend/src/admin/admin.service.ts`
- `backend/src/reviews/reviews.service.ts`

### Pattern: Cache-Aside

`RedisModule` is already `@Global()` — inject `RedisService` anywhere without adding to module imports.

```typescript
// Standard cache-aside pattern (apply to each method below)
const cached = await this.redis.get(KEY);
if (cached) return JSON.parse(cached);
const result = await this.prisma.course.findMany({ ... });
await this.redis.set(KEY, JSON.stringify(result), TTL_SECONDS);
return result;
```

### Cache Keys, TTLs, Invalidation

| Cache Key | Method | TTL | Invalidate When |
|---|---|---|---|
| `courses:featured` | `getFeatured()` | 600s (10 min) | admin publish / archive / reject course |
| `course:detail:{courseId}` | `getCourseDetail()` | 300s (5 min) | course update, review mutation, admin action on course |
| `course:slug:{slug}` | `getCourseBySlug()` | 1800s (30 min) | course slug changes |
| `courses:list:{sort}:{cat}:{level}` | `listPublished()` | 120s (2 min) | only cache when no search/cursor/price filters |
| `categories:all` | `categories.findAll()` | 1800s (30 min) | new category created |

**Critical rule:** Only cache `course:detail:{courseId}` when `course.status === 'PUBLISHED'` and no userId is present (anonymous public view). Never cache the enrollment-aware personalized path — that must always hit the DB.

### Invalidation Points to Add

In `admin.service.ts` → after `publishCourse()`, `archiveCourse()`, `rejectCourse()`:
```typescript
await this.redis.del('courses:featured');
await this.redis.del(`course:detail:${courseId}`);
```

In `reviews.service.ts` → after `recalculateRating()`:
```typescript
await this.redis.del(`course:detail:${courseId}`);
```

### Redis Memory Estimate at 100k Users

| Data | Size |
|---|---|
| User sessions (100k × 500 bytes) | ~50 MB |
| Course detail caches (500 courses × 5 KB) | ~2.5 MB |
| Featured/category caches | ~5 MB |
| Notification unread counters | ~5 MB |
| Rate limiting sorted sets (peak) | ~200 MB |
| **Total** | **~260 MB** |

→ ElastiCache `cache.t4g.small` (1.37 GB) is sufficient.

---

## Priority 2: CloudFront Signed URLs for Video

**Why:** Biggest performance win for a video-heavy LMS. Routes HLS delivery through 400+ CloudFront edge locations globally instead of S3 direct.

### File to Modify

`backend/src/video-upload/video-upload.service.ts` — specifically the `getStreamUrl(videoId)` method.

### Change

**Install:** `@aws-sdk/cloudfront-signer`

**Replace:** `getSignedUrl` from `@aws-sdk/s3-request-presigner` + `GetObjectCommand`

**With:**
```typescript
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const cfUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${video.hlsMasterPath}`;
const signedUrl = getSignedUrl({
    url: cfUrl,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY,  // PEM content
    dateLessThan: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
});
return { streamUrl: signedUrl, expiresIn: 900 };
```

**New env vars required:**
```
CLOUDFRONT_DOMAIN=d1abc123.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=KXXXXXXXXXX
CLOUDFRONT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...
```

**Upload presign (`raw-video` bucket via PUT) stays as S3 presigned — no change.**

### AWS One-Time Setup

1. Create CloudFront distribution → origin = `processed-video` S3 bucket
2. Enable Origin Access Control (OAC) → update S3 bucket policy to deny public, allow CloudFront OAC
3. Create CloudFront key pair (IAM → CloudFront key pairs) → download private key PEM
4. Create Trusted Key Group in the distribution → add the key pair
5. Cache-Control headers on S3 objects:
   - `.m3u8` playlists → `Cache-Control: no-cache` (always revalidate)
   - `.ts` segments → `Cache-Control: max-age=86400` (immutable after transcode)

**No frontend or HLS.js changes needed** — the player just consumes whatever URL is returned.

---

## Priority 3: Kubernetes on EKS + HPA Autoscaling

**Why:** Horizontal scaling requires containerization and orchestration. All 4 services need Dockerfiles (none exist today). EKS manages rolling deploys, health checks, and autoscaling.

### Dockerfiles (Create All 4 — None Exist Yet)

**`backend/Dockerfile`**
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/views ./views
EXPOSE 5001
CMD ["node", "dist/src/main.js"]
```
**Note:** Do NOT run `prisma migrate` in the container. Run as a K8s Job before rolling out pods.

**`frontend/Dockerfile`**
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["node", "server.js"]
```
**Requires:** Add `output: 'standalone'` to `next.config.mjs`.

**`video-transcoder/Dockerfile`**
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 7000
CMD ["node", "dist/index.js"]
```
**Note:** Prefer system FFmpeg (`apk add ffmpeg`) over `@ffmpeg-installer/ffmpeg` bundle on Alpine.

**`notification-service/Dockerfile`**
```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:resolve -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8085
ENV JAVA_OPTS="-Xms256m -Xmx768m"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### K8s Manifests (Replace `deploy/lms-deployment.yaml`)

Split into per-service files under `k8s/`:

| Service | minReplicas | maxReplicas | CPU scale trigger | Resource limits |
|---|---|---|---|---|
| `backend` | 2 | 10 | 60% CPU | 1000m CPU / 1Gi RAM |
| `frontend` | 2 | 8 | 70% CPU | 500m CPU / 512Mi RAM |
| `video-transcoder` | 1 | 4 | 80% CPU | 4000m CPU / 8Gi RAM |
| `notification-service` | 1 | 3 | 70% CPU | 500m CPU / 1Gi RAM |

**Probes for backend:**
- `readinessProbe`: GET `/api/v1/auth/me` → 401 means app is ready (not 5xx)
- `livenessProbe`: GET `/health` (add a simple health endpoint to `main.ts`)

**Ingress:** AWS NLB (Network Load Balancer) — handles WebSocket long-lived connections better than ALB.
```
/* → frontend service
/api/* → backend service
/socket.io/* → backend service (proxy-read-timeout: 3600s)
```

**Secrets:** AWS Secrets Manager + External Secrets Operator. Never commit plaintext secrets to Git.

### AWS Managed Services

| Local | AWS Production |
|---|---|
| PostgreSQL Docker | RDS PostgreSQL 15 Multi-AZ (`db.t4g.medium`) |
| Redis Docker | ElastiCache Redis 7 (1 primary + 1 read replica) |
| Kafka single-broker | Self-managed on EKS → migrate to MSK later |
| MongoDB Docker | DocumentDB or MongoDB Atlas |
| MinIO | Amazon S3 (remove `S3_ENDPOINT` from env) |

---

## Priority 4: WebSocket Real-Time Notifications

**Why:** The notification bell currently polls `/unread-count`. At 100k users, polling is 100k HTTP requests every 30s = 3.3k req/s just for notification counts. WebSocket eliminates this.

**Current state:** `NotificationService.java` already publishes to Redis Pub/Sub channel `notifications`. NestJS has `socket.io` 4.8.3 installed. The plumbing just needs to be connected.

### Files to Modify

**`backend/src/redis/redis.service.ts`**

ioredis cannot use the same client for both commands and subscriptions. Add a dedicated subscriber client:

```typescript
private client: Redis;
private subscriber: Redis;  // ADD THIS

async onModuleInit() {
    this.client = new Redis(this.configService.get('REDIS_URI'));
    this.subscriber = new Redis(this.configService.get('REDIS_URI')); // ADD THIS
}

async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit(); // ADD THIS
}

subscribe(channel: string, callback: (message: string) => void) {
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
        if (ch === channel) callback(msg);
    });
}
```

**`backend/src/notifications/notifications.module.ts`**

Add `NotificationsGateway` to `providers`. Import `JwtModule` for token validation in the gateway.

### New File: `backend/src/notifications/notifications.gateway.ts`

```typescript
@WebSocketGateway({ cors: { origin: process.env.CLIENT_URL, credentials: true } })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private activeConnections = 0;

    constructor(
        private readonly redis: RedisService,
        private readonly jwtService: JwtService,
    ) {}

    afterInit() {
        // Subscribe once on startup; all pods receive every pub/sub message
        this.redis.subscribe('notifications', (message) => {
            const parts = message.split(':');
            const notificationId = parts[0];
            const userId = parts[1];
            const title = parts.slice(2).join(':');  // title may contain colons
            this.server.to(`user:${userId}`).emit('notification', {
                id: notificationId,
                title,
                timestamp: new Date().toISOString(),
            });
        });
    }

    async handleConnection(socket: Socket) {
        try {
            const token = socket.handshake.auth?.token
                || socket.handshake.headers.authorization?.split(' ')[1];
            const payload = this.jwtService.verify(token);
            const session = await this.redis.get(payload.sub);
            if (!session) throw new Error('No session');
            socket.data.userId = payload.sub;
            socket.join(`user:${payload.sub}`);
            this.activeConnections++;
        } catch {
            socket.disconnect(true);
        }
    }

    handleDisconnect() {
        this.activeConnections--;
    }
}
```

**Multi-pod behavior:** Each pod subscribes to Redis Pub/Sub. Each pod receives every message. `server.to('user:X').emit()` silently no-ops if that user's socket is on a different pod — which is correct, because the pod that holds the socket delivers it. **No Redis Adapter needed** — Redis Pub/Sub is already the fan-out mechanism.

### Frontend Changes

**New file: `frontend/src/lib/socket.ts`** (singleton, lazy init)
```typescript
import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;

export function getSocket(token: string): Socket {
    if (!socket) {
        socket = io(process.env.NEXT_PUBLIC_API_BASE_URL!, {
            auth: { token },
            transports: ['websocket'],
        });
    }
    return socket;
}

export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}
```

Add `notificationsSlice` to Redux store + `useNotifications` hook that connects when user logs in, dispatches `notification` events to Redux.

### WebSocket Scaling Math

100k users × 1.2 tabs avg = 120k connections.
10 pods × 10k–12k connections/pod = 100k–120k total.
Fits within HPA max of 10 replicas for the backend.

---

## Priority 5: AWS OpenSearch for Course Search

**Why:** PostgreSQL ILIKE scan on `courses` table is O(n) — at 50k+ courses it degrades to 500ms+. OpenSearch returns sub-50ms with fuzzy matching and faceted filters.

### New NestJS Module: `backend/src/search/`

**Install:** `@nestjs/elasticsearch` + `@elastic/elasticsearch`

**Files to create:**
- `search.module.ts` — registers Elasticsearch client, exports `SearchService`
- `search.service.ts` — `indexCourse()`, `removeCourse()`, `searchCourses()`
- `search.consumer.ts` — Kafka consumer for index sync

### Elasticsearch Index Mapping (`courses` index)

```json
{
  "mappings": {
    "properties": {
      "id":             { "type": "keyword" },
      "title":          { "type": "text", "analyzer": "english", "boost": 3 },
      "description":    { "type": "text", "analyzer": "english" },
      "tags":           { "type": "keyword", "boost": 2 },
      "categoryId":     { "type": "keyword" },
      "level":          { "type": "keyword" },
      "language":       { "type": "keyword" },
      "price":          { "type": "float" },
      "rating":         { "type": "float" },
      "totalStudents":  { "type": "integer" },
      "status":         { "type": "keyword" },
      "instructorName": { "type": "text" }
    }
  }
}
```

### Search Strategy in `courses.service.ts` `listPublished()`

```typescript
if (filters.search) {
    // Search-then-fetch: ES returns IDs, Prisma fetches full data with relations
    const ids = await this.searchService.searchCourses(filters);
    return this.prisma.course.findMany({ where: { id: { in: ids } }, include: { ... } });
} else {
    // Existing Prisma filter query (category/level/price filters stay in Postgres)
    return this.prisma.course.findMany({ where: { ... } });
}
```

### Kafka-Driven Index Sync (`search.consumer.ts`)

Subscribe to: `course.published`, `course.rejected`, `course.archived`, `course.updated`

- `course.published` → fetch from Prisma → `searchService.indexCourse(course)`
- `course.rejected` / `course.archived` → `searchService.removeCourse(courseId)`
- `course.updated` → re-fetch and re-index

**Gap to fix:** `CoursesService.update()` does not currently emit a Kafka event. Add:
```typescript
await this.kafka.emit('course.updated', courseId, { courseId });
```
after the Prisma mutation, so the search index stays in sync when instructors update published courses.

### One-Time Bulk Index

Add admin endpoint `POST /api/v1/admin/search/reindex`:
- Fetch all `PUBLISHED` courses from Prisma
- Bulk index in batches of 1000 using Elasticsearch Bulk API
- Run once after deploying the search module

---

## Priority 6: Redis Sliding Window Rate Limiting

**Why:** Current `ThrottlerModule` uses in-memory counters per pod. With 10 pods, each pod allows 100 req/60s — effectively 1000 req/60s per user. Useless as a rate limiter at scale.

### Files to Change

- `backend/src/app.module.ts` — **remove** `ThrottlerModule` from imports
- `backend/src/redis/redis.service.ts` — add `eval(script, keys, args)` method
- **New:** `backend/src/common/guards/rate-limit.guard.ts`
- **New:** `backend/src/common/decorators/rate-limit.decorator.ts`

### Lua Script (Atomic Sliding Window)

```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, math.ceil(window / 1000))
    return 0  -- allowed
end
return 1  -- rate limited
```

### Rate Limit Tiers

| Tier | Window | Limit | Identifier | Apply To |
|---|---|---|---|---|
| `auth` | 15 min | 10 | IP | `auth.controller.ts` login, register |
| `otp` | 10 min | 5 | IP | `auth.controller.ts` verify |
| `upload` | 1 hour | 20 | userId | `video-upload.controller.ts` presign |
| `write` | 1 min | 30 | userId | Course/lesson mutations |
| `read` | 1 min | 120 | userId or IP | General API reads |
| `search` | 1 min | 60 | userId or IP | Course search endpoint |

**Usage:** `@RateLimit('auth')` on controller methods.

**Response headers:** Always return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` so clients can backoff gracefully.

---

## Priority 7: Prometheus + Grafana Monitoring

**Why:** You can't tune thresholds (rate limits, cache TTLs, HPA triggers) without observability. Deploy before Elasticsearch so you can measure the impact.

### Backend Changes

**Install:** `@willsoto/nestjs-prometheus` + `prom-client`

**New file: `backend/src/common/interceptors/metrics.interceptor.ts`**
Wraps each request, records duration histogram labeled by route.

**Metrics to expose at `/metrics`:**

| Metric | Type | Labels |
|---|---|---|
| `http_request_duration_seconds` | Histogram | method, route, status_code |
| `http_requests_total` | Counter | method, route, status_code |
| `redis_operation_duration_seconds` | Histogram | operation |
| `kafka_produce_total` | Counter | topic |
| `websocket_connections_active` | Gauge | — |
| Node.js default metrics (heap, GC, event loop) | Various | — |

### K8s Deployment

Deploy `kube-prometheus-stack` Helm chart to EKS (includes Prometheus Operator, Grafana, Alertmanager).

Add `k8s/backend/service-monitor.yaml` — `ServiceMonitor` CRD:
```yaml
spec:
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
  selector:
    matchLabels:
      app: lms-backend
```

### Grafana Dashboards

1. **API Dashboard** — request rate, p50/p95/p99 latency per route, 4xx/5xx breakdown
2. **Infrastructure Dashboard** — Redis hit/miss rate, Redis memory, Kafka consumer lag
3. **Business Dashboard** — active WebSocket connections, enrollments/min, video transcode queue depth

### Alert Rules

| Alert | Threshold | Action |
|---|---|---|
| Backend CPU sustained high | > 80% for 5 min (HPA maxed out) | Slack |
| Error rate spike | > 5% for 2 min | PagerDuty |
| Redis memory high | > 85% | Slack (eviction risk = session loss) |
| Kafka consumer lag | > 1000 messages | Slack (search index falling behind) |
| WebSocket connections drop | Sudden drop | Slack (gateway crash) |

---

## Implementation Sequence

### Week 1 — No Infrastructure Changes
1. **Redis caching** in `courses.service.ts`, `categories.service.ts`, invalidation hooks in `admin.service.ts` and `reviews.service.ts`
2. **CloudFront setup** (AWS console one-time) + `video-upload.service.ts` code change

### Week 2 — Infrastructure
3. Write all 4 Dockerfiles. Test with `docker build` locally.
4. Provision EKS cluster, RDS, ElastiCache on AWS. Validate connectivity before deploying app pods.
5. Deploy K8s manifests without HPA first. Validate inter-service communication.
6. Enable HPA after `metrics-server` is confirmed running.

### Week 3 — Real-Time + Observability
7. Redis subscriber client + WebSocket gateway in NestJS. Test single-pod first, then multi-pod.
8. Deploy Prometheus + Grafana (do this before Elasticsearch so you can observe search migration impact).

### Week 4 — Search + Rate Limiting
9. Provision AWS OpenSearch cluster.
10. Deploy `SearchModule` + `SearchConsumer` + bulk reindex via admin endpoint.
11. Redis sliding window rate limiting (tune thresholds using real traffic data in Grafana).

---

## Verification Checklist

- [ ] RedisInsight shows `courses:featured` key with ~600s TTL
- [ ] 2nd `GET /api/v1/courses/featured` response time < 5ms (was ~200ms)
- [ ] Editing a course deletes its `course:detail:{id}` cache key
- [ ] `GET /api/v1/video-upload/{videoId}/stream-url` returns `https://d*.cloudfront.net/...` with `Signature=` param
- [ ] CloudFront URL returns 403 after 15 min (signed URL expired)
- [ ] `kubectl get hpa -n lms` shows all 4 services with current/target metrics
- [ ] Browser DevTools Network tab shows WebSocket connection at `ws://localhost:5001/socket.io/`
- [ ] Triggering a Kafka event delivers notification to browser in < 500ms
- [ ] Two different users in two tabs only receive their own notifications
- [ ] `GET /api/v1/courses?search=javascript` returns in < 50ms (was ~500ms)
- [ ] Publishing a course → it appears in search results within seconds
- [ ] 11th login attempt from same IP within 15 min → 429 with `X-RateLimit-Reset` header
- [ ] Rate limit counter shared across all backend pods (verified via Redis sorted set key in RedisInsight)
- [ ] Grafana shows `http_request_duration_seconds_bucket` latency distribution per route
- [ ] Load test with k6 triggers HPA scale-out from 2→N pods
