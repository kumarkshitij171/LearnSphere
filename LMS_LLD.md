# LMS Platform — Low-Level Design (LLD)

---

## 1. System Architecture

```
                         ┌─────────────────────────────────┐
                         │        Frontend (Next.js 14)     │
                         │  Port 3000 — App Router, SSR     │
                         │  REdux, React Hook Form, Zod   │
                         └──────────────────┬───────────────┘
                                            │ REST / Cookies
                         ┌──────────────────▼───────────────┐
                         │     Backend (NestJS + Prisma)     │
                         │  Port 5001 — Modular Architecture │
                         │  JWT Auth, Guards, Swagger        │
                         └────┬──────────────────┬──────────┘
                              │ Kafka produce     │ REST callback
              ┌───────────────▼──────────┐  ┌────▼──────────────────────┐
              │  Video Transcoder         │  │  Notification Service      │
              │  (Node.js + FFmpeg)       │  │  (Spring Boot 4 + Java 21) │
              │  Port 7000                │  │  Port 8085                 │
              └───────────────┬──────────┘  └────────────────────────────┘
                              │ S3 upload
              ┌───────────────▼──────────┐
              │  MinIO / S3              │
              │  raw-video + processed-video buckets │
              └──────────────────────────┘

  Infrastructure: PostgreSQL · Redis · Kafka · MongoDB · LocalStack
```

---

## 2. Services Overview

| Service | Technology | Port | Responsibility |
|---|---|---|---|
| `frontend` | Next.js 14, TypeScript, Tailwind, Zustand | 3000 | All user-facing UI |
| `backend` | NestJS, TypeScript, Prisma, Stripe | 5001 | Core business logic, REST API |
| `video-transcoder` | Node.js, TypeScript, FFmpeg, Prisma | 7000 | Video processing pipeline |
| `notification-service` | Spring Boot 4, Java 21, Kafka | 8085 | Email + in-app notifications |

---

## 3. Backend API Reference (NestJS)

Base URL: `http://localhost:5001`
Swagger Docs: `http://localhost:5001/api/docs`

### 3.1 Auth Module — `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Register with name, email, password → sends OTP email |
| POST | `/verify` | Public | Verify OTP + token → sets access/refresh cookies |
| POST | `/login` | Public | Login → sets access/refresh cookies |
| POST | `/refresh-token` | Public | Rotate access token using refresh cookie |
| GET | `/logout` | JWT | Clear session and cookies |
| GET | `/me` | JWT | Return current user from Redis session |

**Data flow — Registration:**
1. `POST /register` → hash password → create `User` (STUDENT role, unverified)
2. Generate 4-digit OTP → hash OTP → create JWT signed with `JWT_SECRET` embedding hashed OTP
3. Send activation email (SMTP) with OTP + token
4. `POST /verify` → decode JWT → bcrypt compare OTP → mark `User.isVerified = true`
5. Generate `accessToken` (5m TTL) + `refreshToken` (59m TTL) → store user in Redis → set cookies

---

### 3.2 Users Module — `/api/v1/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/me` | JWT | Get own profile |
| PATCH | `/me` | JWT | Update name, avatar, bio |
| POST | `/me/change-password` | JWT | Change password (requires current) |
| POST | `/me/apply-instructor` | JWT | Submit instructor application (creates `InstructorProfile`) |
| GET | `/instructor/:userId` | Public | Public instructor profile with published courses |

**Data flow — Apply to become instructor:**
1. `POST /me/apply-instructor` → create `InstructorProfile { isApproved: false }`
2. Admin sees pending profile at `GET /api/v1/admin/instructor-applications`
3. Admin approves → `InstructorProfile.isApproved = true`, `User.role = INSTRUCTOR`
4. Kafka event `instructor.approved` → Notification service sends email

---

### 3.3 Categories Module — `/api/v1/categories`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Hierarchical category list (roots + children) |
| POST | `/` | ADMIN | Create category |

---

### 3.4 Courses Module — `/api/v1/courses`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Paginated published courses (cursor-based, filters: category/level/price/rating/search, sort: newest/popular/rating) |
| GET | `/featured` | Public | Top 8 by student count |
| GET | `/slug/:slug` | Public | Course by slug |
| GET | `/:id` | Public | Course by ID (with sections/lessons for enrolled users) |
| POST | `/` | INSTRUCTOR | Create course (DRAFT status, slug auto-generated) |
| PATCH | `/:id` | INSTRUCTOR | Update course details |
| POST | `/:id/submit-review` | INSTRUCTOR | Submit course for admin review |
| DELETE | `/:id` | INSTRUCTOR | Delete (DRAFT only) |
| GET | `/instructor/my-courses` | INSTRUCTOR | Own courses regardless of status |

**Course Status Lifecycle:**
```
DRAFT → [instructor submits] → UNDER_REVIEW → [admin approves] → PUBLISHED
                                             ↘ [admin rejects] → DRAFT (with feedback)
PUBLISHED → [admin archives] → ARCHIVED
```

---

### 3.5 Sections Module — `/api/v1/courses/:courseId/sections`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | INSTRUCTOR | Add section (with order) |
| PATCH | `/:sectionId` | INSTRUCTOR | Rename section |
| DELETE | `/:sectionId` | INSTRUCTOR | Delete section (cascades to lessons) |
| PUT | `/reorder` | INSTRUCTOR | Bulk reorder sections `[{id, order}]` |

---

### 3.6 Lessons Module — `/api/v1`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/sections/:sectionId/lessons` | INSTRUCTOR | Add lesson (VIDEO/TEXT/QUIZ type) |
| PATCH | `/lessons/:lessonId` | INSTRUCTOR | Update lesson (link videoId, set isFree, textContent) |
| DELETE | `/lessons/:lessonId` | INSTRUCTOR | Delete lesson |
| PUT | `/sections/:sectionId/lessons/reorder` | INSTRUCTOR | Bulk reorder lessons |
| GET | `/courses/:courseId/lessons/:lessonId/stream-token` | JWT | Get signed HLS URL (checks enrollment or isFree) |

**Video linking flow:**
1. Instructor uploads video → `POST /api/v1/video-upload/presign` → S3 presigned URL
2. Upload to S3 directly → `POST /api/v1/video-upload` confirm → Kafka `video.uploaded`
3. Transcoder processes → calls `POST /api/v1/video-upload/:videoId/processed` with `hlsMasterPath`
4. Instructor links: `PATCH /lessons/:lessonId` with `{ videoId }` 
5. Student gets `stream-token` → signed S3 URL (15min TTL) → HLS.js plays

---

### 3.7 Enrollment Module — `/api/v1/enrollments`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/free/:courseId` | JWT | Enroll in free course (price must be 0) |
| GET | `/my` | JWT | All enrollments with progress |
| GET | `/:courseId` | JWT | Enrollment detail + full curriculum + lesson progress |
| GET | `/:courseId/progress` | JWT | Progress percent, completed/total lessons |
| POST | `/:courseId/complete-lesson` | JWT | Mark lesson complete (idempotent upsert) |
| POST | `/:courseId/watch-position` | JWT | Save video watch position (seconds) |

**Course completion flow:**
1. `markLessonComplete` → upsert `LessonProgress.isCompleted = true`
2. Count completed vs total lessons → if 100%, emit Kafka `certificate.issue`
3. Notification service picks up `certificate.issue` → (certificate PDF generation is a TODO)

---

### 3.8 Orders Module — `/api/v1/orders`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/checkout` | JWT | Create Stripe PaymentIntent → return `clientSecret` |
| POST | `/webhook` | Public | Stripe webhook (raw body, signature verified) |
| POST | `/validate-coupon` | JWT | Validate coupon code → return discounted price |
| GET | `/my` | JWT | Student's order history |

**Payment flow:**
```
1. POST /checkout → create Order(PENDING) + Stripe PaymentIntent
2. Frontend collects card via Stripe Elements (clientSecret)
3. Stripe sends webhook payment_intent.succeeded
4. POST /webhook → verify signature → Order(COMPLETED) → create Enrollment → Kafka order.completed
5. Notification service: send purchase confirmation email
```

**Revenue split:**
- `platformFeePercent` from env (default 30%)
- `instructorRevenue = amount * 0.70`
- `platformRevenue = amount * 0.30`
- Split stored on `Order` record at creation time (historical immutability)

---

### 3.9 Reviews Module — `/api/v1/courses/:courseId/reviews`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | Paginated reviews (sort: date/rating) |
| POST | `/` | JWT | Create review (must be enrolled, one per student) |
| PATCH | `/` | JWT | Update own review |
| DELETE | `/` | JWT | Delete own review |

Each mutation recalculates `Course.rating` and `Course.reviewCount` via aggregation.

---

### 3.10 Quiz Module — `/api/v1`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| PUT | `/lessons/:lessonId/quiz` | INSTRUCTOR | Create/replace quiz for a lesson |
| DELETE | `/lessons/:lessonId/quiz` | INSTRUCTOR | Delete quiz |
| GET | `/lessons/:lessonId/quiz` | JWT | Get quiz (options served WITHOUT isCorrect flag) |
| POST | `/quizzes/:quizId/attempt` | JWT | Submit answers → score, pass/fail, per-question results |
| GET | `/quizzes/:quizId/attempts` | JWT | Attempt history |

**Question types:** `MCQ` (one correct option) | `TRUE_FALSE` (two options)
**Options JSON:** `[{ id, text, isCorrect }]` — `isCorrect` stripped in GET response

---

### 3.11 Certificates Module — `/api/v1/certificates`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/my` | JWT | Student's earned certificates |
| GET | `/verify/:uuid` | Public | Verify certificate by UUID (for LinkedIn sharing) |

Certificate is issued automatically when `certificate.issue` Kafka event is consumed by the notification service.

---

### 3.12 Q&A Module — `/api/v1`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/lessons/:lessonId/questions` | JWT | Post a question on a lesson |
| GET | `/lessons/:lessonId/questions` | JWT | List questions with answers |
| POST | `/questions/:questionId/answers` | JWT | Answer a question (auto-flags if instructor answers) |
| GET | `/instructor/unanswered-questions` | INSTRUCTOR | All unanswered questions across instructor's courses |

---

### 3.13 Admin Module — `/api/v1/admin` (ADMIN only)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Platform KPIs: users, courses, GMV, top courses, top instructors |
| GET | `/users` | Paginated user list (filterable by role, searchable) |
| PATCH | `/users/:userId/role` | Change user role |
| PATCH | `/users/:userId/ban` | Ban user |
| PATCH | `/users/:userId/unban` | Unban user |
| DELETE | `/users/:userId` | Soft delete user |
| GET | `/instructor-applications` | Pending instructor profiles |
| POST | `/instructor-applications/:id/approve` | Approve instructor |
| POST | `/instructor-applications/:id/reject` | Reject with reason |
| GET | `/courses` | All courses (filter by status) |
| POST | `/courses/:id/publish` | Publish course → Kafka event |
| POST | `/courses/:id/reject` | Reject with feedback → back to DRAFT |
| POST | `/courses/:id/archive` | Archive published course |
| POST | `/coupons` | Create coupon (PERCENT/FIXED, optional courseId/expiry/maxUses) |
| GET | `/instructor-analytics` | Revenue breakdown, enrollment trends for requesting instructor |

---

### 3.14 Video Upload Module — `/api/v1/video-upload`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/presign` | JWT | Get S3 presigned URL + videoId |
| POST | `/` | JWT | Confirm upload → create Video record → Kafka `video.uploaded` |
| POST | `/:videoId/processed` | `X-Transcoder-Api-Key` | Transcoder callback → update Video status |
| GET | `/:videoId` | JWT | Get video metadata |
| GET | `/:videoId/stream-url` | JWT | Generate signed 15-min stream URL |

---

## 4. Notification Service API (Spring Boot) — Port 8085

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/v1/notifications/user/:userId` | Paginated notifications |
| GET | `/api/v1/notifications/user/:userId/unread-count` | Unread count (from Redis) |
| POST | `/api/v1/notifications/user/:userId/mark-all-read` | Mark all read |
| POST | `/api/v1/notifications/:notificationId/read` | Mark one read |

### Kafka Topics Consumed

| Topic | Trigger | Action |
|---|---|---|
| `user.registered` | User registers | Welcome email + notification |
| `order.completed` | Payment succeeds | Purchase confirmation email + notification |
| `video.ready` | Transcoding complete | Notify instructor + notification |
| `quiz.passed` | Quiz attempt passes | Congratulations + notification |
| `certificate.issued` | Certificate generated | Certificate link email + notification |
| `instructor.approved` | Admin approves | Welcome email + notification |
| `instructor.rejected` | Admin rejects | Rejection email + notification |
| `course.published` | Admin publishes | Notify instructor + notification |
| `course.rejected` | Admin rejects | Feedback email + notification |

### Notification Storage (MongoDB)
- Collection: `notifications`
- Fields: `userId`, `type`, `title`, `body`, `actionUrl`, `read`, `createdAt`
- Redis key `notifications:unread:{userId}` tracks unread count (incremented on save, decremented on read)

---

## 5. Database Schema (PostgreSQL via Prisma)

### Key Relationships

```
User (1) ──── (1) InstructorProfile
User (1) ──── (N) Enrollment
User (1) ──── (N) Order
User (1) ──── (N) Review
User (1) ──── (N) QuizAttempt
User (1) ──── (N) Certificate
User (1) ──── (N) LessonQuestion
User (1) ──── (N) LessonAnswer
User (1) ──── (N) Video

InstructorProfile (1) ──── (N) Course
Category (1) ──── (N) Course
Category (1) ──── (N) Category  [parent/child hierarchy]

Course (1) ──── (N) Section
Course (1) ──── (N) Enrollment
Course (1) ──── (N) Order
Course (1) ──── (N) Review
Course (1) ──── (N) Coupon

Section (1) ──── (N) Lesson
Lesson (N) ──── (1) Video     [optional]
Lesson (1) ──── (1) Quiz      [optional]
Lesson (1) ──── (N) LessonAttachment
Lesson (1) ──── (N) LessonProgress
Lesson (1) ──── (N) LessonQuestion

Enrollment (1) ──── (N) LessonProgress
Order (1) ──── (0..1) Enrollment
Order (N) ──── (1) Coupon    [optional]

Quiz (1) ──── (N) Question
Quiz (1) ──── (N) QuizAttempt

Video (1) ──── (N) VideoTranscodeJob
```

### Denormalized Counters (updated on mutation)

| Model | Counter | Updated when |
|---|---|---|
| `Course` | `totalDuration`, `totalLectures` | Lesson created/updated/deleted |
| `Course` | `totalStudents` | Enrollment created |
| `Course` | `rating`, `reviewCount` | Review created/updated/deleted |
| `InstructorProfile` | `totalStudents`, `totalRevenue` | Enrollment / Order completed |

---

## 6. Video Pipeline Data Flow

```
Browser
  │
  ├─1─► GET /api/v1/video-upload/presign
  │       └── Returns: { uploadUrl, videoId, key }
  │
  ├─2─► PUT {uploadUrl} (direct to MinIO/S3, raw-video bucket)
  │
  ├─3─► POST /api/v1/video-upload { videoId, title, mimeType }
  │       └── Creates Video(UPLOADED) in PostgreSQL
  │       └── Kafka publish → topic: video.uploaded
  │              { videoId, userId, bucket, key, resolutions: [240p,480p,720p,1080p] }
  │
  │ [Video Transcoder Service]
  ├─4─► Kafka consumer picks up video.uploaded
  │       └── Downloads from raw-video bucket
  │       └── FFmpeg → 4 resolution HLS streams
  │       └── Uploads segments + playlists to processed-video bucket
  │
  ├─5─► POST /api/v1/video-upload/:videoId/processed (X-Transcoder-Api-Key)
  │       └── Updates Video(READY), sets hlsMasterPath
  │       └── Kafka publish → topic: video.ready
  │
  ├─6─► Instructor links: PATCH /lessons/:lessonId { videoId }
  │
  └─7─► Student: GET /api/v1/video-upload/:videoId/stream-url
              └── Returns signed URL (15 min TTL) for HLS master playlist
              └── Frontend plays via HLS.js
```

---

## 7. Authentication & Session Flow

```
Access Token (5 min JWT, in httpOnly cookie "access_token")
  └── Decoded by JwtStrategy on each request
  └── User session validated against Redis key {userId}

Refresh Token (59 min JWT, in httpOnly cookie "refresh_token")
  └── POST /api/v1/auth/refresh-token → new access token
  └── Frontend interceptor auto-refreshes on 401

Redis Session Key: {userId} → JSON(user) with TTL = refresh token expiry
  └── Del on logout
  └── Updated on token refresh
```

---

## 8. Event Topics (Kafka)

| Topic | Producer | Consumer | Payload |
|---|---|---|---|
| `video.uploaded` | backend | video-transcoder | `{ videoId, userId, bucket, key, resolutions }` |
| `video.ready` | backend | notification-service | `{ videoId, userId, hlsMasterPath }` |
| `order.completed` | backend | notification-service | `{ orderId, userId, courseId, amount }` |
| `quiz.passed` | backend | notification-service | `{ userId, quizId, courseId, score }` |
| `certificate.issue` | backend | notification-service | `{ userId, courseId }` |
| `certificate.issued` | notification-service | — | `{ userId, courseId, pdfUrl }` |
| `instructor.approved` | backend | notification-service | `{ userId }` |
| `instructor.rejected` | backend | notification-service | `{ userId, reason }` |
| `course.published` | backend | notification-service | `{ courseId, instructorId }` |
| `course.rejected` | backend | notification-service | `{ courseId, instructorId, feedback }` |

---

## 9. Frontend Route Map

| Route | Page | Auth |
|---|---|---|
| `/` | Landing — featured courses, categories, stats | Public |
| `/login` | Login form | Public |
| `/signup` | Registration form | Public |
| `/verify?token=...` | OTP verification | Public |
| `/courses` | Course catalog with filters | Public |
| `/courses/[slug]` | Course detail — curriculum, reviews, enroll | Public |
| `/courses/[slug]/learn` | Course player — video + Q&A + progress | Enrolled |
| `/dashboard` | Student dashboard — enrollments + progress | JWT |
| `/checkout` | Stripe checkout page | JWT |
| `/certificates` | Earned certificates | JWT |
| `/profile` | User profile settings | JWT |
| `/instructor/dashboard` | Instructor dashboard + analytics | INSTRUCTOR |
| `/instructor/courses/create` | Create new course | INSTRUCTOR |
| `/instructor/courses/[id]/edit` | Edit course details | INSTRUCTOR |
| `/instructor/courses/[id]/curriculum` | Drag-drop curriculum builder | INSTRUCTOR |
| `/admin/dashboard` | Admin KPIs + queues | ADMIN |
| `/admin/users` | User management | ADMIN |
| `/admin/courses` | Course moderation | ADMIN |
| `/admin/instructors` | Instructor applications | ADMIN |

---

## 10. Environment Variables

### Backend (`backend/.env`)

```
DATABASE_URL=postgres://...
REDIS_URI=rediss://...
JWT_SECRET=...
ACCESS_TOKEN_SECRET=...
ACCESS_TOKEN_EXPIRY=5m
REFRESH_TOKEN_SECRET=...
REFRESH_TOKEN_EXPIRY=59m
BCRYPT_PEPPER=...
CLIENT_URL=http://localhost:3000
PORT=5001
NODE_ENV=development

# S3 / MinIO
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_ENDPOINT=http://localhost:9000     # MinIO in dev
S3_FORCE_PATH_STYLE=true
S3_RAW_VIDEO_BUCKET=raw-video
S3_PROCESSED_VIDEO_BUCKET=processed-video
PRESIGNED_URL_EXPIRY=3600

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=lms-backend

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PLATFORM_FEE_PERCENT=30

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SERVICE=gmail
SMTP_USER_EMAIL=...
SMTP_PASSWORD=...

# Internal
TRANSCODER_API_KEY=...
```

### Notification Service (`notification-service/application.properties`)

```
MONGODB_URI=mongodb://localhost:27017/lms_notifications
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=local
KAFKA_BROKERS=localhost:9092
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER_EMAIL=...
SMTP_PASSWORD=...
```

---

## 11. Running the Stack

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Backend — migrate DB and start NestJS
cd backend
cp .env.sample .env      # fill in secrets
npm run prisma:push      # push schema to DB
npm run dev              # port 5001

# 3. Video Transcoder
cd video-transcoder
pnpm install
pnpm run prisma:generate
pnpm run dev             # port 7000

# 4. Notification Service
cd notification-service
./mvnw spring-boot:run   # port 8085

# 5. Frontend
cd frontend
npm install
npm run dev              # port 3000
```

---

## 12. Key Design Decisions

| Decision | Rationale |
|---|---|
| NestJS over Express | Dependency injection, guards, decorators, built-in Swagger — cleaner for 15+ modules |
| Cursor pagination | Avoids OFFSET performance degradation on large datasets |
| Denormalized counters | Avoid live aggregation queries on every course page load |
| Kafka over direct HTTP | Decouples transcoder and notification service; retryable, backpressure-safe |
| `isFree` flag on lessons | Allows preview without enrollment while keeping the rest locked |
| Revenue split stored on Order | Historical immutability — changing platform fee doesn't retroactively modify past orders |
| `verificationUuid` on Certificate | Enables public share link (LinkedIn) without exposing internal IDs |
| Spring Boot for Notifications | Java excels at long-lived Kafka consumer processes; MongoDB suits append-only notification docs |
