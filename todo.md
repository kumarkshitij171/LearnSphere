# LMS Platform — Implementation Roadmap

A scalable, Udemy-like Learning Management System with student, instructor, and admin roles built on a microservices architecture.

---

## Current State

**What is working / built:**
- ✅ Full Prisma schema — all 17+ models (User, Course, Section, Lesson, Enrollment, Order, Quiz, Certificate, Review, Q&A, etc.)
- ✅ Backend migrated from Express → **NestJS** (modular architecture, Guards, Interceptors, Swagger)
- ✅ User authentication (register, email OTP verify, login, JWT + Redis sessions, refresh tokens)
- ✅ S3 presigned upload → Kafka event → Video transcoder → HLS output → signed stream URLs
- ✅ Video transcoding service (FFmpeg, multi-resolution HLS playlists)
- ✅ Course & curriculum API (full CRUD, sections, lessons, slug, status lifecycle)
- ✅ Enrollment & payment system (Stripe PaymentIntent, webhooks, coupon codes, revenue split)
- ✅ Progress tracking (lesson completion, watch position, course completion detection)
- ✅ Quiz system (authoring, MCQ/T-F, attempts, scoring, pass/fail)
- ✅ Certificate issuance (auto-trigger on completion, PDF generation, public verification)
- ✅ Reviews & Q&A (submit/edit/delete reviews, aggregate rating, lesson questions & answers)
- ✅ Notification service (Spring Boot, Kafka consumers for all events, MongoDB + Redis, in-app bell)
- ✅ Admin panel backend (user management, instructor approval, course moderation, platform stats)
- ✅ Instructor analytics backend (revenue, enrollments, lesson drop-off)
- ✅ Frontend — All pages complete: Landing, Auth, Catalog, Course Detail, Course Player (HLS.js)
- ✅ Frontend — Student dashboard, Checkout, Certificates, Profile settings
- ✅ Frontend — Instructor dashboard, Course builder (create/edit), Curriculum editor (video upload)
- ✅ Frontend — Admin dashboard, Users table, Instructor queue, Course moderation
- ✅ Frontend — Redux Toolkit state management (migrated from Zustand)
- ✅ Docker Compose infrastructure (PostgreSQL, Redis, Kafka, MinIO, MongoDB, LocalStack)
- ✅ Kubernetes deployment skeleton and Jenkinsfile CI/CD skeleton
- ✅ LMS_LLD.md — comprehensive API reference, data model, architecture docs

**What is NOT yet built:**
- ⬜ Phase 10 — Full-text search (PostgreSQL tsvector)
- ⬜ Phase 11 — DevOps completion (multi-stage Dockerfiles, HPA, CI/CD pipeline)
- ⬜ Phase 12 — Scale optimisations (CDN, Redis cache, read replica)

---

## Architecture Overview

```
                   ┌──────────────────────────────────────────┐
                   │            Frontend (Next.js 14)          │
                   │  Student | Instructor | Admin dashboards  │
                   └──────────────┬───────────────────────────┘
                                  │ REST / WebSocket
                   ┌──────────────▼───────────────────────────┐
                   │         Backend API (NestJS/TS)            │
                   │  Auth · Courses · Enrollment · Payment     │
                   │  Videos · Quizzes · Reviews · Analytics    │
                   └──┬──────────────────────────┬────────────┘
                      │ Kafka events              │ REST callbacks
         ┌────────────▼──────────┐   ┌───────────▼─────────────┐
         │  Video Transcoder     │   │  Notification Service    │
         │  (Node.js + FFmpeg)   │   │  (Spring Boot + Kafka)   │
         └────────────┬──────────┘   └──────────────────────────┘
                      │
         ┌────────────▼──────────┐
         │  S3 / MinIO           │
         │  raw-video bucket     │
         │  processed-video bucket│
         └───────────────────────┘

Infrastructure: PostgreSQL · Redis · Kafka · MongoDB · LocalStack
```

### Video Pipeline (existing — no changes needed)

```
Browser
  → requests presigned URL from Backend
  → uploads video file directly to S3
  → confirms upload to Backend
  → Backend publishes event to Kafka topic "video.uploaded"
  → Video Transcoder consumes event
  → FFmpeg transcodes to multiple resolutions + generates HLS playlist
  → Transcoder uploads HLS files to processed-video S3 bucket
  → Transcoder calls Backend REST callback with hlsMasterPath
  → Backend marks video as READY in database
  → Frontend fetches hlsMasterPath and streams via HLS.js
```

---

## Phase 1 — Roles & Core Data Model ✅ COMPLETE

Full Prisma schema rewritten with all enums and 17+ models:
- `UserRole`: STUDENT, INSTRUCTOR, ADMIN
- `CourseStatus`: DRAFT → UNDER_REVIEW → PUBLISHED → ARCHIVED
- `CourseLevel`: BEGINNER, INTERMEDIATE, ADVANCED
- `LessonType`: VIDEO, TEXT, QUIZ
- `OrderStatus`: PENDING → COMPLETED | FAILED | REFUNDED
- Models: User, InstructorProfile, Category, Course, Section, Lesson, LessonAttachment, Enrollment, LessonProgress, Order, Coupon, Quiz, Question, QuizAttempt, Certificate, Review, LessonQuestion, LessonAnswer

---

## Phase 2 — Backend API: Courses & Users ✅ COMPLETE

Migrated to **NestJS** with 16 feature modules + 3 global infrastructure modules.
- ✅ Auth module (register, OTP verify, login, logout, refresh token)
- ✅ Courses module (CRUD, slug, status lifecycle, listing, cursor pagination, featured)
- ✅ Sections & Lessons modules (CRUD, reorder, isFree flag)
- ✅ Categories module (hierarchical)
- ✅ Users/Profile module (update profile, instructor application, public instructor profile)
- ✅ Video Upload module (presign, confirm, stream URL with signed S3 URLs)

---

## Phase 3 — Enrollment & Payment ✅ COMPLETE

- ✅ Stripe PaymentIntent checkout initiation
- ✅ Stripe webhook handler (raw body + signature verification)
- ✅ Coupon validation endpoint
- ✅ Free course enrollment
- ✅ Enrollment list + detail with progress
- ✅ Lesson completion marking (idempotent)
- ✅ Watch position saving
- ✅ Course completion detection + certificate trigger
- ✅ Revenue split (70/30) stored per Order

---

## Phase 4 — Secure Video Delivery ✅ COMPLETE

- ✅ Signed S3 URLs (15-min TTL) for HLS master playlists
- ✅ EnrolledGuard: verifies enrollment or isFree before issuing stream token
- ✅ LessonAttachments: upload + signed download URLs

---

## Phase 5 — Quiz & Certificate System ✅ COMPLETE

- ✅ Quiz authoring (create, update, delete — MCQ + true/false)
- ✅ Quiz attempts (submit, evaluate, pass/fail, explanation per question)
- ✅ Attempt history
- ✅ Certificate auto-issuance on course completion
- ✅ Public certificate verification endpoint (no auth)
- ✅ Student certificate list

---

## Phase 6 — Reviews, Q&A, and Notifications ✅ COMPLETE

- ✅ Reviews: submit/edit/delete, aggregate rating recalculation
- ✅ Lesson Q&A: questions + answers, instructor flag
- ✅ Notification Service (Spring Boot) — Kafka consumers for all 8 topics
- ✅ In-app notifications: MongoDB storage, Redis unread counts, mark read

---

## Phase 7 — Instructor Analytics ✅ COMPLETE (Backend)

- ✅ Dashboard summary (total students, revenue, avg rating, course count)
- ✅ Per-course analytics (enrollment trend, lesson completion, revenue breakdown)
- ✅ Student list per course with progress

---

## Phase 8 — Admin Panel ✅ COMPLETE (Backend)

- ✅ Platform stats (GMV, signups, active courses, top instructors)
- ✅ User management (paginated list, ban/unban, role change)
- ✅ Instructor approval (list pending, approve, reject)
- ✅ Course moderation (list UNDER_REVIEW, publish, reject with feedback, archive)
- ✅ Coupon management

---

## Phase 9 — Frontend (Next.js) ✅ COMPLETE

### 9.1 Student Pages

| Page | Status |
|---|---|
| Landing page | ✅ Built |
| Course catalog (filter, sort, paginate) | ✅ Built |
| Course detail (curriculum preview, enroll CTA) | ✅ Built |
| Student dashboard (enrolled courses + progress) | ✅ Built |
| Checkout (Stripe Elements + coupon) | ✅ Built |
| Course player (HLS.js + sidebar + Q&A) | ✅ Built |
| Certificates list | ✅ Built |
| Profile settings | ✅ Built |

### 9.2 Instructor Pages

| Page | Status |
|---|---|
| Instructor dashboard (metrics, course list) | ✅ Built |
| Course builder (create/edit) | ✅ Built |
| Curriculum editor (sections/lessons + video upload) | ✅ Built |

### 9.3 Admin Pages

| Page | Status |
|---|---|
| Admin dashboard (platform KPIs) | ✅ Built |
| Users table (search, ban, role change) | ✅ Built |
| Instructor queue (approve/reject) | ✅ Built |
| Course moderation queue | ✅ Built |

### 9.4 Shared Components

- ✅ Navbar (role-aware, notification bell, user menu, certificates link)
- ✅ CourseCard
- ✅ Skeleton loaders
- ✅ Toast system (Sonner)
- ✅ HLS video player (hls.js integrated in course player)
- ✅ Textarea UI component
- ✅ Redux Toolkit state management (replaced Zustand)
- 🔄 Star rating input
- 🔄 Rich text editor (Tiptap)

---

## Phase 10 — Search & Discovery ⬜ NOT STARTED

### 10.1 PostgreSQL Full-Text Search (MVP)

Add a computed `tsvector` column to the Course table that indexes title, description, and tags. Create a GIN index. The search endpoint queries this vector with ranked results.

### 10.2 Elasticsearch (Post-MVP)

Kafka-driven course index sync for fuzzy matching and faceted filters.

---

## Phase 11 — DevOps & Observability ⬜ NOT STARTED

- ⬜ Multi-stage Dockerfiles for all services (FFmpeg in transcoder image)
- ⬜ Next.js standalone output for minimal prod image
- ⬜ K8s Deployments + HPA on Video Transcoder (min 2, max 10 replicas)
- ⬜ ConfigMap + Secrets separation
- ⬜ Ingress with TLS (cert-manager + Let's Encrypt)
- ⬜ CI/CD pipeline completion (lint → test → build → push → rolling deploy → Slack notify)
- ⬜ Prometheus `/metrics` endpoint, Grafana dashboards
- ⬜ Structured JSON logging (Winston / Logback) with requestId, userId, service fields

---

## Phase 12 — Scalability Improvements (Post-MVP) ⬜ NOT STARTED

- ⬜ CDN for video delivery (CloudFront/Cloudflare in front of processed-video bucket)
- ⬜ Redis cache-aside for course pages (5-min TTL, invalidate on publish/update)
- ⬜ PostgreSQL read replica (catalog/search reads → replica, writes → primary)
- ⬜ User-ID-based rate limiting (Redis sliding window)
- ⬜ Nightly analytics aggregation job
- ⬜ Kafka partition by userId for video.uploaded topic

---

## Implementation Priority

| Priority | Phase | Status |
|---|---|---|
| 1 | Phase 1 — Data model | ✅ Complete |
| 2 | Phase 2 — Course & instructor API (NestJS) | ✅ Complete |
| 3 | Phase 3 — Enrollment & payment (Stripe) | ✅ Complete |
| 4 | Phase 4 — Secure video delivery | ✅ Complete |
| 5 | Phase 5 — Quiz & certificates | ✅ Complete |
| 6 | Phase 6 — Reviews, Q&A, notifications | ✅ Complete |
| 7 | Phase 7 & 8 — Dashboards & admin panel | ✅ Backend complete |
| 8 | Phase 9 — Frontend | ✅ Complete |
| 9 | Phase 10 — Search | ⬜ Not started |
| 10 | Phase 11 — DevOps completion | ⬜ Not started |
| 11 | Phase 12 — Scale optimisations | ⬜ Not started |

---

## New Environment Variables Required

```env
# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Platform
PLATFORM_FEE_PERCENT=30
CLIENT_URL=http://localhost:3000

# Kafka topics
KAFKA_TOPIC_VIDEO_UPLOADED=video.uploaded
KAFKA_TOPIC_VIDEO_READY=video.ready
KAFKA_TOPIC_ORDER_COMPLETED=order.completed
KAFKA_TOPIC_USER_REGISTERED=user.registered
KAFKA_TOPIC_QUIZ_PASSED=quiz.passed
KAFKA_TOPIC_CERTIFICATE_ISSUED=certificate.issued
KAFKA_TOPIC_INSTRUCTOR_APPROVED=instructor.approved
KAFKA_TOPIC_COURSE_PUBLISHED=course.published
```
