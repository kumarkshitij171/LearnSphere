# 🎬 Video Transcoding Service - Implementation Todo

A comprehensive guide to building a scalable, cloud-native video transcoding service with Node.js, FFmpeg, Docker, AWS S3 + SQS, Kafka, Redis + BullMQ, and Kubernetes.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Core Infrastructure Setup](#phase-1-core-infrastructure-setup)
3. [Phase 2: AWS S3 Integration](#phase-2-aws-s3-integration)
4. [Phase 3: SQS Event Handling](#phase-3-sqs-event-handling)
5. [Phase 4: Kafka Integration](#phase-4-kafka-integration)
6. [Phase 5: BullMQ + Redis Job Queue](#phase-5-bullmq--redis-job-queue)
7. [Phase 6: Transcoding Workers](#phase-6-transcoding-workers)
8. [Phase 7: API Server Implementation](#phase-7-api-server-implementation)
9. [Phase 8: Frontend Integration](#phase-8-frontend-integration)
10. [Phase 9: Docker & Kubernetes](#phase-9-docker--kubernetes)
11. [Phase 10: Monitoring & Testing](#phase-10-monitoring--testing)

---

## 🧠 Architecture Overview

```
Frontend (Next.js)
   |
   | (1) Request Presigned URL
   v
API Server (Node.js/Express)
   |
   | (2) Presigned Upload
   v
S3 (Raw Video Bucket)
   |
   | (3) ObjectCreated Event
   v
SQS Queue
   |
   | (4) Kafka Producer
   v
Kafka Topic (video-transcode)
   |
   | (5) BullMQ Producer
   v
Redis + BullMQ Queue
   |
   | (6) Worker Pods (FFmpeg)
   v
S3 (Processed Videos Bucket)
   |
   | (7) Status Update
   v
Database (Prisma/PostgreSQL)
```

---

## 📦 Phase 1: Core Infrastructure Setup

### 1.1 Install Required Dependencies

**Backend Dependencies:**
- [ ] Install AWS SDK v3: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/client-sqs`
- [ ] Install Kafka client: `npm install kafkajs`
- [ ] Install BullMQ: `npm install bullmq`
- [ ] Install FFmpeg wrapper: `npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg`
- [ ] Install file utilities: `npm install multer multer-s3 uuid`
- [ ] Install additional utilities: `npm install dotenv express-validator`

**How to do it:**
```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/client-sqs kafkajs bullmq fluent-ffmpeg @ffmpeg-installer/ffmpeg multer multer-s3 uuid express-validator
```

### 1.2 Environment Variables Setup

- [ ] Create `.env` file with all required variables
- [ ] Add AWS credentials and region
- [ ] Add S3 bucket names (raw and processed)
- [ ] Add SQS queue URL
- [ ] Add Kafka broker URLs
- [ ] Add Redis connection details
- [ ] Add database connection string

**Required Environment Variables:**
```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# S3 Buckets
S3_RAW_VIDEO_BUCKET=raw-video-bucket-name
S3_PROCESSED_VIDEO_BUCKET=processed-video-bucket-name

# SQS
SQS_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=video-transcode-service
KAFKA_TOPIC_VIDEO_TRANSCODE=video-transcode

# Redis + BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### 1.3 Database Schema Updates

- [ ] Create Prisma schema for video metadata
- [ ] Add Video model with fields: id, userId, originalKey, status, resolutions, createdAt, updatedAt
- [ ] Add VideoTranscodeJob model for tracking jobs
- [ ] Run migrations

**Prisma Schema Example:**
```prisma
model Video {
  id            String   @id @default(uuid())
  userId        String
  originalKey   String   // S3 key for original video
  fileName      String
  fileSize      Int
  mimeType      String
  status        VideoStatus @default(PENDING)
  resolutions   Json     // Array of transcoded resolutions
  metadata      Json?    // Video metadata (duration, codec, etc.)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user          User     @relation(fields: [userId], references: [id])
  transcodeJobs VideoTranscodeJob[]
}

model VideoTranscodeJob {
  id          String   @id @default(uuid())
  videoId     String
  resolution  String   // e.g., "1080p", "720p", "480p"
  status      JobStatus @default(QUEUED)
  inputKey    String
  outputKey   String?
  error       String?
  progress    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  video       Video    @relation(fields: [videoId], references: [id])
}

enum VideoStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum JobStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}
```

**How to do it:**
1. Update `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_video_models`
3. Generate Prisma client: `npx prisma generate`

---

## ☁️ Phase 2: AWS S3 Integration

### 2.1 AWS S3 Client Setup

- [ ] Create S3 service utility file: `backend/services/s3.service.ts`
- [ ] Initialize S3 client with AWS SDK v3
- [ ] Implement presigned URL generation for uploads
- [ ] Implement presigned URL generation for downloads
- [ ] Add error handling and logging

**Implementation Steps:**

1. **Create S3 Service:**
```typescript
// backend/services/s3.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const generatePresignedUploadURL = async (
  fileName: string,
  contentType: string,
  userId: string
): Promise<{ url: string; key: string }> => {
  const key = `uploads/${userId}/${uuidv4()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_RAW_VIDEO_BUCKET!,
    Key: key,
    ContentType: contentType,
  });
  
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  
  return { url, key };
};

export const generatePresignedDownloadURL = async (
  key: string,
  bucket: string
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};
```

### 2.2 S3 Bucket Configuration

- [ ] Create raw video bucket in AWS S3
- [ ] Create processed video bucket in AWS S3
- [ ] Configure CORS for both buckets
- [ ] Set up bucket policies for public/private access
- [ ] Enable versioning (optional)
- [ ] Configure lifecycle policies for old videos

**CORS Configuration (Raw Video Bucket):**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Bucket Policy (Processed Video Bucket - Read Access):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::processed-video-bucket/*"
    }
  ]
}
```

### 2.3 S3 Event Notification Setup

- [ ] Configure S3 bucket event notifications
- [ ] Set up ObjectCreated event to trigger SQS
- [ ] Filter events by file extension (.mp4, .mov, .avi, etc.)
- [ ] Test event triggering

**How to do it (AWS Console):**
1. Go to S3 bucket → Properties → Event notifications
2. Create event notification:
   - Event type: `s3:ObjectCreated:*`
   - Prefix: `uploads/`
   - Suffix: `.mp4` (or other video formats)
   - Destination: SQS Queue (select your queue)

**How to do it (AWS CLI):**
```bash
aws s3api put-bucket-notification-configuration \
  --bucket raw-video-bucket-name \
  --notification-configuration file://notification-config.json
```

---

## 📨 Phase 3: SQS Event Handling

### 3.1 SQS Queue Setup

- [ ] Create SQS queue in AWS Console
- [ ] Configure queue settings (visibility timeout, message retention)
- [ ] Set up dead-letter queue for failed messages
- [ ] Get queue URL and ARN

**Queue Configuration:**
- Visibility Timeout: 300 seconds (5 minutes)
- Message Retention Period: 14 days
- Receive Message Wait Time: 20 seconds (long polling)
- Maximum Receives: 3 (before moving to DLQ)

### 3.2 SQS Consumer Service

- [ ] Create SQS consumer service: `backend/services/sqs.service.ts`
- [ ] Implement message polling
- [ ] Parse S3 event from SQS message
- [ ] Forward to Kafka producer
- [ ] Handle message deletion after processing
- [ ] Implement error handling and retry logic

**Implementation Steps:**

1. **Create SQS Service:**
```typescript
// backend/services/sqs.service.ts
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { kafkaProducer } from './kafka.service';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface S3Event {
  Records: Array<{
    s3: {
      bucket: { name: string };
      object: { key: string; size: number };
    };
  }>;
}

export const startSQSConsumer = async () => {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL!,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20, // Long polling
      });
      
      const response = await sqsClient.send(command);
      
      if (response.Messages && response.Messages.length > 0) {
        for (const message of response.Messages) {
          try {
            const body = JSON.parse(message.Body || '{}');
            const s3Event: S3Event = JSON.parse(body.Message || body);
            
            // Process each S3 record
            for (const record of s3Event.Records) {
              const bucket = record.s3.bucket.name;
              const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
              
              // Send to Kafka
              await kafkaProducer.send({
                topic: process.env.KAFKA_TOPIC_VIDEO_TRANSCODE!,
                messages: [{
                  key: key,
                  value: JSON.stringify({
                    bucket,
                    key,
                    size: record.s3.object.size,
                    timestamp: new Date().toISOString(),
                  }),
                }],
              });
              
              console.log(`Forwarded S3 event to Kafka: ${key}`);
            }
            
            // Delete message after successful processing
            if (message.ReceiptHandle) {
              await sqsClient.send(new DeleteMessageCommand({
                QueueUrl: process.env.SQS_QUEUE_URL!,
                ReceiptHandle: message.ReceiptHandle,
              }));
            }
          } catch (error) {
            console.error('Error processing SQS message:', error);
            // Message will become visible again after visibility timeout
          }
        }
      }
    } catch (error) {
      console.error('Error receiving SQS messages:', error);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
    }
  }
};
```

### 3.3 Start SQS Consumer

- [ ] Initialize SQS consumer in main application file
- [ ] Run consumer in separate process or worker thread
- [ ] Add graceful shutdown handling

**How to do it:**
```typescript
// backend/index.ts or backend/workers/sqs-consumer.ts
import { startSQSConsumer } from './services/sqs.service';

// Start SQS consumer
startSQSConsumer().catch(console.error);
```

---

## 🚀 Phase 4: Kafka Integration

### 4.1 Kafka Setup

- [ ] Install and configure Kafka (local or cloud)
- [ ] Create Kafka topic: `video-transcode`
- [ ] Configure topic with appropriate partitions (e.g., 3-5)
- [ ] Set up replication factor (if using cluster)

**Local Kafka Setup (Docker):**
```yaml
# docker-compose.yml addition
kafka:
  image: confluentinc/cp-kafka:latest
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
  ports:
    - "9092:9092"
  depends_on:
    - zookeeper

zookeeper:
  image: confluentinc/cp-zookeeper:latest
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181
```

**Create Topic:**
```bash
kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic video-transcode \
  --partitions 3 \
  --replication-factor 1
```

### 4.2 Kafka Producer Service

- [ ] Create Kafka producer service: `backend/services/kafka.service.ts`
- [ ] Initialize Kafka client
- [ ] Implement producer connection
- [ ] Add error handling and retry logic
- [ ] Implement graceful shutdown

**Implementation Steps:**

1. **Create Kafka Service:**
```typescript
// backend/services/kafka.service.ts
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'video-transcode-service',
  brokers: process.env.KAFKA_BROKERS!.split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

export const kafkaProducer = kafka.producer();

export const connectKafkaProducer = async () => {
  await kafkaProducer.connect();
  console.log('Kafka producer connected');
};

export const disconnectKafkaProducer = async () => {
  await kafkaProducer.disconnect();
  console.log('Kafka producer disconnected');
};
```

### 4.3 Kafka Consumer Service

- [ ] Create Kafka consumer service
- [ ] Implement consumer group
- [ ] Process messages from `video-transcode` topic
- [ ] Forward messages to BullMQ queue
- [ ] Implement commit offset logic

**Implementation Steps:**

1. **Create Kafka Consumer:**
```typescript
// backend/services/kafka-consumer.service.ts
import { Kafka } from 'kafkajs';
import { addTranscodeJob } from './bullmq.service';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'video-transcode-service',
  brokers: process.env.KAFKA_BROKERS!.split(','),
});

export const kafkaConsumer = kafka.consumer({ groupId: 'video-transcode-group' });

export const startKafkaConsumer = async () => {
  await kafkaConsumer.connect();
  await kafkaConsumer.subscribe({ 
    topic: process.env.KAFKA_TOPIC_VIDEO_TRANSCODE!,
    fromBeginning: false 
  });
  
  await kafkaConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const data = JSON.parse(message.value?.toString() || '{}');
        
        // Add job to BullMQ queue
        await addTranscodeJob({
          bucket: data.bucket,
          key: data.key,
          size: data.size,
        });
        
        console.log(`Added transcode job to BullMQ: ${data.key}`);
      } catch (error) {
        console.error('Error processing Kafka message:', error);
      }
    },
  });
  
  console.log('Kafka consumer started');
};
```

### 4.4 Initialize Kafka Services

- [ ] Connect Kafka producer on application startup
- [ ] Start Kafka consumer in separate process
- [ ] Add error handling and reconnection logic

---

## 🔄 Phase 5: BullMQ + Redis Job Queue

### 5.1 Redis Setup

- [ ] Install and configure Redis (local or cloud)
- [ ] Set up Redis connection
- [ ] Configure Redis persistence (optional)
- [ ] Test Redis connection

**Redis Docker Setup:**
```yaml
# docker-compose.yml addition
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  command: redis-server --appendonly yes
  volumes:
    - redis-data:/data

volumes:
  redis-data:
```

### 5.2 BullMQ Queue Setup

- [ ] Create BullMQ queue: `backend/services/bullmq.service.ts`
- [ ] Initialize Redis connection for BullMQ
- [ ] Create transcode queue with job options
- [ ] Configure retry and backoff strategies
- [ ] Set up job priorities

**Implementation Steps:**

1. **Create BullMQ Service:**
```typescript
// backend/services/bullmq.service.ts
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

export const transcodeQueue = new Queue('video-transcode', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000, // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // Keep failed jobs for 24 hours
    },
  },
});

interface TranscodeJobData {
  bucket: string;
  key: string;
  size: number;
  videoId?: string;
  resolutions?: string[];
}

export const addTranscodeJob = async (data: TranscodeJobData) => {
  return await transcodeQueue.add('transcode-video', data, {
    priority: data.size > 100 * 1024 * 1024 ? 1 : 5, // Larger files get lower priority
  });
};

// Job progress tracking
export const updateJobProgress = async (jobId: string, progress: number) => {
  const job = await transcodeQueue.getJob(jobId);
  if (job) {
    await job.updateProgress(progress);
  }
};
```

### 5.3 BullMQ Worker Setup

- [ ] Create BullMQ worker for processing jobs
- [ ] Implement worker in separate file: `backend/workers/transcode.worker.ts`
- [ ] Connect to transcoding service
- [ ] Handle job completion and failure
- [ ] Update job progress

**Implementation Steps:**

1. **Create Worker:**
```typescript
// backend/workers/transcode.worker.ts
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { processVideoTranscode } from '../services/transcode.service';

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

export const transcodeWorker = new Worker(
  'video-transcode',
  async (job: Job) => {
    const { bucket, key, size, videoId, resolutions } = job.data;
    
    console.log(`Processing transcode job ${job.id} for ${key}`);
    
    // Update progress
    await job.updateProgress(10);
    
    // Process video transcoding
    const result = await processVideoTranscode({
      bucket,
      key,
      size,
      videoId,
      resolutions: resolutions || ['1080p', '720p', '480p', '360p'],
      jobId: job.id!,
      updateProgress: (progress: number) => job.updateProgress(progress),
    });
    
    await job.updateProgress(100);
    
    return result;
  },
  {
    connection,
    concurrency: 2, // Process 2 jobs concurrently
    limiter: {
      max: 5, // Max 5 jobs
      duration: 10000, // Per 10 seconds
    },
  }
);

transcodeWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

transcodeWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

### 5.4 Queue Monitoring

- [ ] Add queue monitoring endpoints
- [ ] Implement job status checking
- [ ] Add queue metrics (waiting, active, completed, failed)

---

## 🎥 Phase 6: Transcoding Workers

### 6.1 FFmpeg Installation

- [ ] Install FFmpeg in Docker container
- [ ] Verify FFmpeg installation
- [ ] Test FFmpeg commands

**Dockerfile for Transcoding Worker:**
```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["node", "workers/transcode.worker.js"]
```

### 6.2 Transcoding Service

- [ ] Create transcoding service: `backend/services/transcode.service.ts`
- [ ] Implement video download from S3
- [ ] Implement parallel transcoding for multiple resolutions
- [ ] Implement video upload to processed bucket
- [ ] Add progress tracking
- [ ] Handle errors and cleanup

**Implementation Steps:**

1. **Create Transcoding Service:**
```typescript
// backend/services/transcode.service.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, unlinkSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface TranscodeOptions {
  bucket: string;
  key: string;
  size: number;
  videoId?: string;
  resolutions: string[];
  jobId: string;
  updateProgress: (progress: number) => Promise<void>;
}

const resolutionConfigs: Record<string, { width: number; height: number; bitrate: string }> = {
  '1080p': { width: 1920, height: 1080, bitrate: '5000k' },
  '720p': { width: 1280, height: 720, bitrate: '2500k' },
  '480p': { width: 854, height: 480, bitrate: '1000k' },
  '360p': { width: 640, height: 360, bitrate: '600k' },
};

export const processVideoTranscode = async (options: TranscodeOptions) => {
  const { bucket, key, resolutions, jobId, updateProgress } = options;
  const tempDir = `/tmp/transcode-${jobId}`;
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPaths: Record<string, string> = {};
  
  try {
    // Create temp directory
    if (!existsSync(tempDir)) {
      require('fs').mkdirSync(tempDir, { recursive: true });
    }
    
    // Download video from S3
    await updateProgress(10);
    const getObjectCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getObjectCommand);
    const writeStream = createWriteStream(inputPath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
    await updateProgress(20);
    
    // Transcode to multiple resolutions in parallel
    const transcodePromises = resolutions.map(async (resolution) => {
      const config = resolutionConfigs[resolution];
      const outputPath = path.join(tempDir, `output-${resolution}.mp4`);
      outputPaths[resolution] = outputPath;
      
      return new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .size(`${config.width}x${config.height}`)
          .videoBitrate(config.bitrate)
          .format('mp4')
          .videoCodec('libx264')
          .audioCodec('aac')
          .on('progress', async (progress) => {
            const totalProgress = 20 + (progress.percent || 0) * 0.7; // 20-90%
            await updateProgress(Math.min(totalProgress, 90));
          })
          .on('end', () => {
            console.log(`Transcoding completed for ${resolution}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Transcoding error for ${resolution}:`, err);
            reject(err);
          })
          .save(outputPath);
      });
    });
    
    await Promise.all(transcodePromises);
    await updateProgress(90);
    
    // Upload transcoded videos to S3
    const uploadPromises = Object.entries(outputPaths).map(async ([resolution, filePath]) => {
      const outputKey = `processed/${key.replace('uploads/', '').replace(/\.[^/.]+$/, '')}-${resolution}.mp4`;
      
      const fileContent = require('fs').readFileSync(filePath);
      const putObjectCommand = new PutObjectCommand({
        Bucket: process.env.S3_PROCESSED_VIDEO_BUCKET!,
        Key: outputKey,
        Body: fileContent,
        ContentType: 'video/mp4',
      });
      
      await s3Client.send(putObjectCommand);
      return { resolution, key: outputKey };
    });
    
    const uploadedFiles = await Promise.all(uploadPromises);
    await updateProgress(100);
    
    // Cleanup temp files
    Object.values(outputPaths).forEach(filePath => {
      if (existsSync(filePath)) unlinkSync(filePath);
    });
    if (existsSync(inputPath)) unlinkSync(inputPath);
    if (existsSync(tempDir)) require('fs').rmdirSync(tempDir);
    
    return {
      success: true,
      resolutions: uploadedFiles,
    };
  } catch (error) {
    // Cleanup on error
    Object.values(outputPaths).forEach(filePath => {
      if (existsSync(filePath)) unlinkSync(filePath);
    });
    if (existsSync(inputPath)) unlinkSync(inputPath);
    
    throw error;
  }
};
```

### 6.3 Parallel Processing Optimization

- [ ] Implement worker pool for parallel FFmpeg processes
- [ ] Add CPU and memory monitoring
- [ ] Implement resource limits per worker
- [ ] Add queue-based load balancing

### 6.4 Video Metadata Extraction

- [ ] Extract video metadata (duration, codec, resolution)
- [ ] Store metadata in database
- [ ] Use metadata for validation and optimization

---

## 🌐 Phase 7: API Server Implementation

### 7.1 Video Upload Controller

- [ ] Create video upload controller: `backend/controllers/videoUpload.controller.ts`
- [ ] Implement presigned URL generation endpoint
- [ ] Implement video metadata creation endpoint
- [ ] Add validation middleware
- [ ] Add authentication middleware

**Implementation Steps:**

1. **Create Controller:**
```typescript
// backend/controllers/videoUpload.controller.ts
import { Request, Response, NextFunction } from 'express';
import { generatePresignedUploadURL } from '../services/s3.service';
import { prisma } from '../utils/db';
import { addTranscodeJob } from '../services/bullmq.service';

export const generatePresignedURL = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileName, fileSize, mimeType } = req.body;
    const userId = req.user?.id; // From auth middleware
    
    if (!fileName || !fileSize || !mimeType) {
      return res.status(400).json({
        success: false,
        message: 'fileName, fileSize, and mimeType are required',
      });
    }
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only MP4, MOV, and AVI are allowed',
      });
    }
    
    // Generate presigned URL
    const { url, key } = await generatePresignedUploadURL(fileName, mimeType, userId);
    
    // Create video record in database
    const video = await prisma.video.create({
      data: {
        userId,
        originalKey: key,
        fileName,
        fileSize: parseInt(fileSize),
        mimeType,
        status: 'PENDING',
        resolutions: [],
      },
    });
    
    res.status(200).json({
      success: true,
      data: {
        uploadUrl: url,
        videoId: video.id,
        key,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const confirmUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { videoId } = req.body;
    const userId = req.user?.id;
    
    const video = await prisma.video.findUnique({
      where: { id: videoId, userId },
    });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }
    
    // Update status - SQS will trigger processing
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING' },
    });
    
    res.status(200).json({
      success: true,
      message: 'Upload confirmed. Processing will start shortly.',
    });
  } catch (error) {
    next(error);
  }
};
```

### 7.2 Video Status Controller

- [ ] Create video status endpoint
- [ ] Return current transcoding status
- [ ] Return available resolutions
- [ ] Return presigned URLs for transcoded videos

**Implementation:**
```typescript
export const getVideoStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { videoId } = req.params;
    const userId = req.user?.id;
    
    const video = await prisma.video.findUnique({
      where: { id: videoId, userId },
      include: { transcodeJobs: true },
    });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found',
      });
    }
    
    // Generate presigned URLs for completed transcodes
    const resolutions = await Promise.all(
      (video.resolutions as any[]).map(async (res: any) => ({
        ...res,
        url: await generatePresignedDownloadURL(
          res.key,
          process.env.S3_PROCESSED_VIDEO_BUCKET!
        ),
      }))
    );
    
    res.status(200).json({
      success: true,
      data: {
        videoId: video.id,
        status: video.status,
        resolutions,
        metadata: video.metadata,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
```

### 7.3 Routes Setup

- [ ] Create video routes: `backend/routes/videoUpload.routes.ts`
- [ ] Add authentication middleware
- [ ] Add validation middleware
- [ ] Connect routes to controller

**Implementation:**
```typescript
// backend/routes/videoUpload.routes.ts
import express from 'express';
import {
  generatePresignedURL,
  confirmUpload,
  getVideoStatus,
} from '../controllers/videoUpload.controller';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

router.post('/presigned-url', isAuthenticated, generatePresignedURL);
router.post('/confirm-upload', isAuthenticated, confirmUpload);
router.get('/status/:videoId', isAuthenticated, getVideoStatus);

export default router;
```

### 7.4 Database Update Service

- [ ] Create service to update video status in database
- [ ] Update status when transcoding starts
- [ ] Update status when transcoding completes
- [ ] Store transcoded video keys

---

## 💻 Phase 8: Frontend Integration

### 8.1 Upload Component

- [ ] Create video upload component
- [ ] Request presigned URL from backend
- [ ] Upload video directly to S3
- [ ] Show upload progress
- [ ] Handle upload errors

**Implementation Steps:**

1. **Create Upload Component:**
```typescript
// frontend/src/components/VideoUpload.tsx
'use client';

import { useState } from 'react';
import axios from 'axios';

export default function VideoUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleUpload = async () => {
    if (!file) return;
    
    try {
      setUploading(true);
      
      // Step 1: Get presigned URL
      const { data } = await axios.post('/api/videos/presigned-url', {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      
      setVideoId(data.data.videoId);
      
      // Step 2: Upload directly to S3
      await axios.put(data.data.uploadUrl, file, {
        headers: {
          'Content-Type': file.type,
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          setProgress(percentCompleted);
        },
      });
      
      // Step 3: Confirm upload
      await axios.post('/api/videos/confirm-upload', {
        videoId: data.data.videoId,
      });
      
      alert('Upload successful! Processing will start shortly.');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div>
      <input type="file" accept="video/*" onChange={handleFileSelect} />
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? `Uploading... ${progress}%` : 'Upload Video'}
      </button>
    </div>
  );
}
```

### 8.2 Status Polling Component

- [ ] Create component to poll video status
- [ ] Display transcoding progress
- [ ] Show available resolutions
- [ ] Display video player when ready

**Implementation:**
```typescript
// frontend/src/components/VideoStatus.tsx
'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function VideoStatus({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const { data } = await axios.get(`/api/videos/status/${videoId}`);
        setStatus(data.data);
        
        // Continue polling if still processing
        if (data.data.status === 'PROCESSING') {
          setTimeout(pollStatus, 5000); // Poll every 5 seconds
        }
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    pollStatus();
  }, [videoId]);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <h3>Status: {status?.status}</h3>
      {status?.resolutions && status.resolutions.length > 0 && (
        <div>
          <h4>Available Resolutions:</h4>
          {status.resolutions.map((res: any) => (
            <video key={res.resolution} controls width="640">
              <source src={res.url} type="video/mp4" />
            </video>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 8.3 API Integration

- [ ] Create API route handlers in Next.js
- [ ] Add authentication headers
- [ ] Handle errors gracefully
- [ ] Add loading states

---

## 🐳 Phase 9: Docker & Kubernetes

### 9.1 Docker Setup

- [ ] Create Dockerfile for API server
- [ ] Create Dockerfile for transcoding worker
- [ ] Create docker-compose.yml for local development
- [ ] Test Docker containers locally

**Dockerfile for API Server:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 8000

CMD ["node", "dist/index.js"]
```

**Dockerfile for Transcoding Worker:**
```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run build

CMD ["node", "dist/workers/transcode.worker.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_HOST=redis
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - redis
      - kafka
      - postgres

  transcode-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - AWS_REGION=${AWS_REGION}
    depends_on:
      - redis
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  kafka:
    image: confluentinc/cp-kafka:latest
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    depends_on:
      - zookeeper

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: lms
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

### 9.2 Kubernetes Configuration

- [ ] Create Kubernetes namespace
- [ ] Create ConfigMap for environment variables
- [ ] Create Secrets for sensitive data
- [ ] Create Deployment for API server
- [ ] Create Deployment for transcoding workers
- [ ] Create Service for API server
- [ ] Create HorizontalPodAutoscaler for workers
- [ ] Create Ingress for external access

**Kubernetes Deployment Example:**
```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: video-api
  namespace: video-transcode
spec:
  replicas: 3
  selector:
    matchLabels:
      app: video-api
  template:
    metadata:
      labels:
        app: video-api
    spec:
      containers:
      - name: api
        image: your-registry/video-api:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: video-secrets
              key: database-url
        - name: REDIS_HOST
          value: "redis-service"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: video-api-service
  namespace: video-transcode
spec:
  selector:
    app: video-api
  ports:
  - port: 80
    targetPort: 8000
  type: LoadBalancer
```

**Worker Deployment with Autoscaling:**
```yaml
# k8s/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: transcode-worker
  namespace: video-transcode
spec:
  replicas: 5
  selector:
    matchLabels:
      app: transcode-worker
  template:
    metadata:
      labels:
        app: transcode-worker
    spec:
      containers:
      - name: worker
        image: your-registry/transcode-worker:latest
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: transcode-worker-hpa
  namespace: video-transcode
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: transcode-worker
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 9.3 CI/CD Pipeline

- [ ] Set up GitHub Actions or GitLab CI
- [ ] Build Docker images
- [ ] Push to container registry
- [ ] Deploy to Kubernetes
- [ ] Run tests before deployment

---

## 📊 Phase 10: Monitoring & Testing

### 10.1 Logging

- [ ] Set up structured logging (Winston/Pino)
- [ ] Add request logging middleware
- [ ] Log transcoding progress
- [ ] Log errors with context

### 10.2 Monitoring

- [ ] Set up Prometheus metrics
- [ ] Monitor queue lengths
- [ ] Monitor transcoding duration
- [ ] Monitor error rates
- [ ] Set up Grafana dashboards

### 10.3 Error Handling

- [ ] Implement comprehensive error handling
- [ ] Add retry mechanisms
- [ ] Set up dead-letter queues
- [ ] Implement alerting

### 10.4 Testing

- [ ] Write unit tests for services
- [ ] Write integration tests for API
- [ ] Test transcoding pipeline end-to-end
- [ ] Load testing with multiple videos
- [ ] Test failure scenarios

### 10.5 Documentation

- [ ] Document API endpoints
- [ ] Document deployment process
- [ ] Create architecture diagrams
- [ ] Write operational runbooks

---

## 🔧 Additional Considerations

### Performance Optimization

- [ ] Implement video thumbnail generation
- [ ] Add video preview generation
- [ ] Optimize FFmpeg parameters for faster transcoding
- [ ] Implement caching for frequently accessed videos
- [ ] Use CDN for video delivery

### Security

- [ ] Implement rate limiting
- [ ] Add file size limits
- [ ] Validate file types server-side
- [ ] Implement virus scanning (optional)
- [ ] Add CORS configuration
- [ ] Secure S3 bucket policies

### Cost Optimization

- [ ] Implement video cleanup for old/unused videos
- [ ] Use S3 lifecycle policies
- [ ] Optimize worker resource allocation
- [ ] Monitor and alert on costs

### Scalability

- [ ] Implement horizontal scaling for workers
- [ ] Use message batching where possible
- [ ] Optimize database queries
- [ ] Implement connection pooling
- [ ] Use read replicas for database

---

## 📝 Implementation Checklist Summary

- [ ] Phase 1: Core Infrastructure Setup
- [ ] Phase 2: AWS S3 Integration
- [ ] Phase 3: SQS Event Handling
- [ ] Phase 4: Kafka Integration
- [ ] Phase 5: BullMQ + Redis Job Queue
- [ ] Phase 6: Transcoding Workers
- [ ] Phase 7: API Server Implementation
- [ ] Phase 8: Frontend Integration
- [ ] Phase 9: Docker & Kubernetes
- [ ] Phase 10: Monitoring & Testing

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
cd backend && npm install

# Set up environment variables
cp .env.sample .env
# Edit .env with your credentials

# Run database migrations
npx prisma migrate dev

# Start Redis and Kafka (Docker)
docker-compose up -d redis kafka zookeeper

# Start API server
npm run dev

# Start SQS consumer (separate terminal)
node dist/workers/sqs-consumer.js

# Start Kafka consumer (separate terminal)
node dist/workers/kafka-consumer.js

# Start BullMQ worker (separate terminal)
node dist/workers/transcode.worker.js
```

---

**Last Updated:** [Current Date]
**Status:** Planning Phase