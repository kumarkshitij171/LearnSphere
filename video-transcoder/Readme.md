# 🎬 Video Transcoding Service

A scalable, cloud-native video transcoding service that processes uploaded videos and converts them into multiple resolutions (240p, 480p, 720p, 1080p) using FFmpeg. The service integrates with Kafka for message queuing, AWS S3 for storage, and PostgreSQL for metadata management.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Design](#system-design)
3. [Data Flow](#data-flow)
4. [Components](#components)
5. [Technology Stack](#technology-stack)
6. [Setup & Installation](#setup--installation)
7. [Configuration](#configuration)
8. [Usage](#usage)
9. [API Endpoints](#api-endpoints)
10. [Monitoring & Logging](#monitoring--logging)
11. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VIDEO TRANSCODING PIPELINE                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Frontend   │
│  (Next.js)   │
└──────┬───────┘
       │
       │ 1. Request Presigned URL
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Backend API Server                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  POST /api/videos/generate-presigned-url                     │  │
│  │  - Validates user authentication                             │  │
│  │  - Generates presigned S3 upload URL                         │  │
│  │  - Creates video record in database (status: PENDING)        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 2. Upload Video Directly to S3
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    AWS S3 (Raw Video Bucket)                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Bucket: raw-video                                            │  │
│  │  Key: uploads/{userId}/{uuid}-{filename}.mp4                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 3. S3 ObjectCreated Event
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    AWS SQS Queue                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Queue: video-transcode-queue                                 │  │
│  │  - Receives S3 event notifications                            │  │
│  │  - Buffers messages for reliable processing                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 4. SQS Consumer → Kafka Producer
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Kafka Topic                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Topic: video-transcode                                       │  │
│  │  Partitions: 3-5 (for scalability)                           │  │
│  │  - Decouples SQS from transcoding service                      │  │
│  │  - Enables multiple consumers                                  │  │
│  │  - Provides message replay capability                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 5. Kafka Consumer (This Service)
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Video Transcoding Service                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  1. Kafka Consumer receives message                           │  │
│  │  2. Download video from S3 (raw-video bucket)                 │  │
│  │  3. Transcode using FFmpeg to 4 resolutions:                   │  │
│  │     - 240p  (426x240,  400k bitrate)                           │  │
│  │     - 480p  (854x480,  1000k bitrate)                          │  │
│  │     - 720p  (1280x720, 2500k bitrate)                         │  │
│  │     - 1080p (1920x1080, 5000k bitrate)                         │  │
│  │  4. Upload transcoded videos to S3 (processed-video bucket)   │  │
│  │  5. Update database with video status and resolutions          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 6. Update Database
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Video Table:                                                 │  │
│  │  - id, userId, originalKey, status                            │  │
│  │  - resolutions: [{resolution, key, size}]                    │  │
│  │                                                                │  │
│  │  VideoTranscodeJob Table:                                     │  │
│  │  - id, videoId, resolution, status, outputKey                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ 7. Store Transcoded Videos
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              AWS S3 (Processed Video Bucket)                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Bucket: processed-video                                       │  │
│  │  Keys:                                                        │  │
│  │    - processed/{userId}/{uuid}-240p.mp4                       │  │
│  │    - processed/{userId}/{uuid}-480p.mp4                       │  │
│  │    - processed/{userId}/{uuid}-720p.mp4                        │  │
│  │    - processed/{userId}/{uuid}-1080p.mp4                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 System Design

### Design Principles

1. **Decoupled Architecture**: Services communicate through message queues (SQS/Kafka), enabling independent scaling and fault tolerance.

2. **Event-Driven**: The system reacts to S3 upload events, ensuring automatic processing without manual intervention.

3. **Scalability**: 
   - Kafka partitions allow horizontal scaling of consumers
   - Multiple transcoding worker instances can process videos in parallel
   - Stateless design enables easy containerization and orchestration

4. **Reliability**:
   - Message queues provide durability and retry mechanisms
   - Database tracks job status for recovery
   - Error handling and cleanup ensure no orphaned files

5. **Performance**:
   - Parallel transcoding of multiple resolutions
   - Direct S3 uploads reduce backend load
   - Efficient FFmpeg encoding parameters

### Key Design Decisions

#### Why Kafka between SQS and Transcoding Service?

1. **Decoupling**: Separates SQS event processing from transcoding logic
2. **Scalability**: Kafka partitions enable parallel processing
3. **Replayability**: Can replay messages for debugging or reprocessing
4. **Multiple Consumers**: Different services can consume the same events
5. **Message Ordering**: Kafka maintains order within partitions

#### Why Multiple Resolutions?

1. **Adaptive Streaming**: Different devices/networks need different qualities
2. **Bandwidth Optimization**: Lower resolutions for slower connections
3. **Storage Efficiency**: Users can choose appropriate quality
4. **CDN Optimization**: Different resolutions can be cached separately

#### Why FFmpeg?

1. **Industry Standard**: Widely used, well-documented
2. **Format Support**: Handles all major video formats
3. **Quality Control**: Fine-grained control over encoding parameters
4. **Performance**: Efficient encoding algorithms

---

## 🔄 Data Flow

### Detailed Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UPLOAD FLOW                                  │
└─────────────────────────────────────────────────────────────────────┘

Step 1: User Initiates Upload
   Frontend → Backend API: POST /api/videos/generate-presigned-url
   Payload: { fileName, contentType }
   Response: { url: presignedUrl, key: s3Key, videoId }

Step 2: Create Database Record
   Backend → Database: INSERT INTO Video
   Status: PENDING
   OriginalKey: s3Key

Step 3: Direct Upload to S3
   Frontend → S3: PUT {presignedUrl}
   Headers: Content-Type: video/mp4
   Body: Video file

Step 4: S3 Event Notification
   S3 → SQS: ObjectCreated event
   Message: { bucket, key, size, timestamp }

Step 5: SQS Consumer Processing
   SQS Consumer → Kafka Producer: Send message
   Topic: video-transcode
   Payload: { bucket, key, size, videoId }

┌─────────────────────────────────────────────────────────────────────┐
│                      TRANSCODING FLOW                                 │
└─────────────────────────────────────────────────────────────────────┘

Step 6: Kafka Consumer Receives Message
   Kafka → Transcoding Service: Consume message
   Extract: { bucket, key, size, videoId }

Step 7: Mark Video as Processing
   Transcoding Service → Database: UPDATE Video
   Status: PROCESSING

Step 8: Download Original Video
   Transcoding Service → S3: GetObject
   Source: raw-video/{key}
   Destination: /tmp/video-transcode/{jobId}/input.mp4

Step 9: Transcode to Multiple Resolutions
   FFmpeg Process (Parallel):
   ├─ input.mp4 → output-240p.mp4  (426x240,  400k)
   ├─ input.mp4 → output-480p.mp4  (854x480,  1000k)
   ├─ input.mp4 → output-720p.mp4  (1280x720, 2500k)
   └─ input.mp4 → output-1080p.mp4 (1920x1080, 5000k)

Step 10: Upload Transcoded Videos
   Transcoding Service → S3: PutObject (x4)
   Source: /tmp/video-transcode/{jobId}/output-{resolution}.mp4
   Destination: processed-video/processed/{baseKey}-{resolution}.mp4

Step 11: Update Database
   Transcoding Service → Database:
   ├─ UPDATE Video: Status = COMPLETED, Resolutions = [...]
   └─ CREATE VideoTranscodeJob: One per resolution

Step 12: Cleanup Temporary Files
   Transcoding Service: Delete /tmp/video-transcode/{jobId}/*
```

---

## 🧩 Components

### 1. Kafka Consumer Service (`src/services/kafka.service.ts`)

**Responsibilities**:
- Connect to Kafka brokers
- Subscribe to `video-transcode` topic
- Consume messages and forward to handler
- Handle reconnection and errors

**Key Features**:
- Consumer group for load balancing
- Automatic offset management
- Error handling and retry logic

### 2. S3 Service (`src/services/s3.service.ts`)

**Responsibilities**:
- Download videos from raw-video bucket
- Upload transcoded videos to processed-video bucket
- Manage temporary file cleanup

**Key Features**:
- Streaming downloads for large files
- Error handling and retry logic
- Automatic directory creation

### 3. Transcoding Service (`src/services/transcode.service.ts`)

**Responsibilities**:
- Orchestrate video transcoding process
- Configure FFmpeg for multiple resolutions
- Parallel processing of resolutions
- Progress tracking

**Key Features**:
- Configurable resolution presets
- Parallel transcoding for performance
- Comprehensive error handling
- Automatic cleanup on failure

### 4. Database Service (`src/services/db.service.ts`)

**Responsibilities**:
- Update video status (PENDING → PROCESSING → COMPLETED/FAILED)
- Store transcoded video metadata
- Create transcode job records
- Query video information

**Key Features**:
- Prisma ORM for type safety
- Transaction support
- Error handling

### 5. Main Service (`src/index.ts`)

**Responsibilities**:
- Initialize all services
- Start Kafka consumer
- Handle graceful shutdown
- Health check endpoints

---

## 🛠️ Technology Stack

### Core Technologies

- **Node.js** (v18+): Runtime environment
- **TypeScript**: Type-safe development
- **Express**: HTTP server for health checks

### Message Queue & Streaming

- **Kafka**: Message streaming platform
- **Kafkajs**: Kafka client for Node.js

### Storage

- **AWS S3**: Object storage for videos
- **AWS SDK v3**: S3 client library

### Video Processing

- **FFmpeg**: Video encoding/transcoding
- **fluent-ffmpeg**: Node.js wrapper for FFmpeg

### Database

- **PostgreSQL**: Relational database
- **Prisma**: ORM for database access

### Infrastructure

- **Docker**: Containerization
- **Kubernetes**: Orchestration (optional)

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js 18+ and pnpm/npm
- FFmpeg installed on system
- Kafka broker running
- AWS S3 buckets configured
- PostgreSQL database accessible
- Prisma schema migrated

### Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

### Install Dependencies

```bash
cd video-transcoder
pnpm install
# or
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=7000
NODE_ENV=development

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_ENDPOINT=http://localhost:9000  # For local MinIO
S3_FORCE_PATH_STYLE=true

# S3 Buckets
S3_RAW_VIDEO_BUCKET=raw-video
S3_PROCESSED_VIDEO_BUCKET=processed-video
PRESIGNED_URL_EXPIRY=3600

# SQS (for reference, not used directly in this service)
SQS_ENDPOINT=http://localhost:4566
SQS_QUEUE_URL=http://localhost:4566/000000000000/video-transcode-queue

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=video-transcode-service
KAFKA_TOPIC_VIDEO_TRANSCODE=video-transcode

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/lms
```

### Database Setup

Ensure Prisma schema is migrated:

```bash
cd ../backend
npx prisma migrate dev
npx prisma generate
```

### Build

```bash
pnpm run build
```

### Run

**Development:**
```bash
pnpm run dev
```

**Production:**
```bash
pnpm run build
pnpm start
```

---

## ⚙️ Configuration

### Resolution Presets

Default resolutions are defined in `src/services/transcode.service.ts`:

```typescript
const RESOLUTION_CONFIGS = {
  '240p': { width: 426, height: 240, bitrate: '400k' },
  '480p': { width: 854, height: 480, bitrate: '1000k' },
  '720p': { width: 1280, height: 720, bitrate: '2500k' },
  '1080p': { width: 1920, height: 1080, bitrate: '5000k' },
};
```

### FFmpeg Encoding Parameters

- **Video Codec**: libx264 (H.264)
- **Audio Codec**: aac
- **Preset**: medium (balance between speed and quality)
- **CRF**: 23 (constant rate factor for quality)
- **Pixel Format**: yuv420p (maximum compatibility)
- **Fast Start**: Enabled for web streaming

---

## 📡 Usage

### Starting the Service

1. Ensure Kafka is running and topic exists:
```bash
kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic video-transcode \
  --partitions 3 \
  --replication-factor 1
```

2. Start the transcoding service:
```bash
pnpm run dev
```

### Sending Test Messages

You can test the service by sending a message to Kafka:

```bash
kafka-console-producer --broker-list localhost:9092 --topic video-transcode
```

Then paste:
```json
{
  "bucket": "raw-video",
  "key": "uploads/user123/video-123.mp4",
  "size": 10485760,
  "videoId": "video-uuid-here"
}
```

---

## 🌐 API Endpoints

### Health Check

**GET** `/`
```json
{
  "message": "Video Transcoding Service is running",
  "status": "healthy"
}
```

**GET** `/health`
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 📊 Monitoring & Logging

### Logging

The service logs important events:

- ✅ Success operations
- ❌ Errors and failures
- 📨 Kafka message consumption
- 🎬 Transcoding progress
- 📥📤 S3 operations
- 🗑️ Cleanup operations

### Key Metrics to Monitor

1. **Kafka Consumer Lag**: Messages waiting to be processed
2. **Transcoding Duration**: Time per video
3. **Success Rate**: Completed vs failed jobs
4. **S3 Operations**: Download/upload times
5. **Database Queries**: Update operation performance
6. **Disk Usage**: Temporary file storage

### Health Checks

Monitor:
- Kafka connectivity
- S3 connectivity
- Database connectivity
- FFmpeg availability
- Disk space availability

---

## 🔧 Troubleshooting

### Common Issues

#### 1. FFmpeg Not Found

**Error**: `FFmpeg not found`

**Solution**:
```bash
# Verify FFmpeg installation
ffmpeg -version

# Install if missing (see Setup section)
```

#### 2. Kafka Connection Failed

**Error**: `Failed to connect to Kafka broker`

**Solution**:
- Verify Kafka is running: `kafka-broker-api-versions --bootstrap-server localhost:9092`
- Check `KAFKA_BROKERS` environment variable
- Verify network connectivity

#### 3. S3 Access Denied

**Error**: `Access Denied` or `403 Forbidden`

**Solution**:
- Verify AWS credentials in `.env`
- Check S3 bucket permissions
- Verify bucket names are correct

#### 4. Database Connection Failed

**Error**: `Can't reach database server`

**Solution**:
- Verify `DATABASE_URL` is correct
- Check database is running
- Verify network connectivity
- Run Prisma migrations

#### 5. Out of Disk Space

**Error**: `ENOSPC: no space left on device`

**Solution**:
- Clean up `/tmp/video-transcode/` directory
- Increase disk space
- Monitor temporary file cleanup

#### 6. Video Transcoding Fails

**Error**: `Transcoding error` or corrupted output

**Solution**:
- Verify input video format is supported
- Check FFmpeg version compatibility
- Review FFmpeg logs for specific errors
- Verify sufficient CPU/memory resources

---

## 🎯 Performance Considerations

### Optimization Tips

1. **Parallel Processing**: Transcode multiple resolutions simultaneously
2. **Resource Limits**: Monitor CPU/memory usage per worker
3. **Temporary Storage**: Use fast SSD storage for `/tmp`
4. **S3 Multipart Upload**: For large files (>100MB)
5. **Connection Pooling**: Reuse S3 and database connections
6. **Batch Processing**: Process multiple videos in batches

### Scaling Strategies

1. **Horizontal Scaling**: Run multiple transcoding service instances
2. **Kafka Partitions**: Increase partitions for more parallelism
3. **Worker Pools**: Use worker threads for CPU-intensive tasks
4. **CDN Integration**: Serve transcoded videos via CDN
5. **Caching**: Cache frequently accessed videos

---

## 🔐 Security Considerations

1. **Credentials**: Store AWS credentials securely (use IAM roles in production)
2. **Network**: Use VPC for internal communication
3. **Input Validation**: Validate video files before processing
4. **Resource Limits**: Set limits on file size and processing time
5. **Access Control**: Implement proper authentication/authorization
6. **Encryption**: Use S3 server-side encryption

---

## 📝 Future Enhancements

- [ ] Support for additional video formats (WebM, AV1)
- [ ] Thumbnail generation
- [ ] Video preview/clip generation
- [ ] Adaptive bitrate streaming (HLS/DASH)
- [ ] GPU acceleration for faster transcoding
- [ ] Real-time progress updates via WebSocket
- [ ] Retry mechanism with exponential backoff
- [ ] Dead letter queue for failed jobs
- [ ] Metrics export (Prometheus)
- [ ] Distributed tracing (OpenTelemetry)

---

## 📄 License

ISC

---

## 👥 Contributors

- Development Team

---

**Last Updated**: February 2026
