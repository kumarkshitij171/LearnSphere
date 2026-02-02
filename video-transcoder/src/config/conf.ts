import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT),
  nodeEnv: process.env.NODE_ENV,
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    rawVideoBucket: process.env.S3_RAW_VIDEO_BUCKET,
    processedVideoBucket: process.env.S3_PROCESSED_VIDEO_BUCKET,
    presignedUrlExpiry: process.env.PRESIGNED_URL_EXPIRY
      ? parseInt(process.env.PRESIGNED_URL_EXPIRY)
      : 3600,
  },
  sqs: {
    endpoint: process.env.SQS_ENDPOINT,
    queueUrl: process.env.SQS_QUEUE_URL,
  },
  kafka: {
    brokers: process.env.KAFKA_BROKERS || '',
    clientId: process.env.KAFKA_CLIENT_ID || 'video-transcode-service',
    topicVideoTranscode: process.env.KAFKA_TOPIC_VIDEO_TRANSCODE || 'video.uploaded',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
};