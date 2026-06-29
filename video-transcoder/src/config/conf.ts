import dotenv from "dotenv";

dotenv.config();

// true -> use LocalStack for local dev; false -> real AWS account
const useLocalStack = process.env.LOCAL_STACK_DATA_SOURCE === "true";
const localstackEndpoint = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";

export const config = {
  port: Number(process.env.PORT),
  nodeEnv: process.env.NODE_ENV,
  localStack: useLocalStack,
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    accessKeyId: useLocalStack ? process.env.AWS_ACCESS_KEY_ID || "test" : process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: useLocalStack ? process.env.AWS_SECRET_ACCESS_KEY || "test" : process.env.AWS_SECRET_ACCESS_KEY,
  },
  s3: {
    endpoint: useLocalStack ? localstackEndpoint : process.env.S3_ENDPOINT,
    forcePathStyle: useLocalStack ? true : process.env.S3_FORCE_PATH_STYLE === "true",
    rawVideoBucket: process.env.S3_RAW_VIDEO_BUCKET,
    processedVideoBucket: process.env.S3_PROCESSED_VIDEO_BUCKET,
    presignedUrlExpiry: process.env.PRESIGNED_URL_EXPIRY
      ? parseInt(process.env.PRESIGNED_URL_EXPIRY)
      : 3600,
  },
  sqs: {
    endpoint: useLocalStack ? localstackEndpoint : process.env.SQS_ENDPOINT,
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