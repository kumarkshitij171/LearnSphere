import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

type PresignedUploadResponse = { url: string; key: string };

/** For flow: presign → upload to S3 → POST /videos. Key = videoId/original.mp4 so transcoder gets clear path. */
export type PresignedVideoUploadResponse = { url: string; key: string; videoId: string };

const createS3Client = () =>
  new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    // For local (MinIO/LocalStack) we rely on a custom endpoint and path-style.
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    // If real AWS credentials are present use them, otherwise fall back to
    // the default credential provider chain (useful when running in AWS).
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

const s3Client = createS3Client();
const ensuredBuckets = new Set<string>();

const ensureBucketExists = async (bucket: string) => {
  if (ensuredBuckets.has(bucket)) return;

  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    await s3Client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      })
    );
    ensuredBuckets.add(bucket);
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    const code = error?.Code || error?.code || error?.name;

    // If bucket truly does not exist, create it. Otherwise rethrow.
    if (status === 404 || code === 'NotFound' || code === 'NoSuchBucket') {
      const createParams: any = { Bucket: bucket };

      // For real AWS in non-us-east-1 we must specify LocationConstraint.
      if (!process.env.S3_ENDPOINT && region !== 'us-east-1') {
        createParams.CreateBucketConfiguration = {
          LocationConstraint: region,
        };
      }

      await s3Client.send(new CreateBucketCommand(createParams));
      ensuredBuckets.add(bucket);
      return;
    }

    throw error;
  }
};

export const generatePresignedUploadURL = async (
  fileName: string,
  contentType: string,
  userId: string
): Promise<PresignedUploadResponse> => {
  const bucket = process.env.S3_RAW_VIDEO_BUCKET;
  if (!bucket) {
    throw new Error('S3_RAW_VIDEO_BUCKET is not configured');
  }

  // Ensure the target bucket exists (for local dev and first-time AWS setup).
  await ensureBucketExists(bucket);

  const key = `uploads/${userId}/${randomUUID()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRY || '3600', 10),
  });

  return { url, key };
};

/**
 * Generate presigned URL for video upload with a known videoId.
 * S3 key: {videoId}/original.mp4 (under raw bucket). Used by: presign → frontend uploads → POST /videos.
 */
export const generatePresignedUploadURLForVideo = async (
  videoId: string,
  contentType: string
): Promise<PresignedVideoUploadResponse> => {
  const bucket = process.env.S3_RAW_VIDEO_BUCKET;
  if (!bucket) {
    throw new Error('S3_RAW_VIDEO_BUCKET is not configured');
  }
  await ensureBucketExists(bucket);

  const key = `${videoId}/original.mp4`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRY || '3600', 10),
  });

  return { url, key, videoId };
};

export const generatePresignedDownloadURL = async (
  key: string,
  bucket: string
): Promise<string> => {
  if (!bucket) {
    throw new Error('Bucket is required for download URL generation');
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRY || '3600', 10),
  });
};