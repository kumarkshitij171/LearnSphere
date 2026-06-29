import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { awsClientConfig } from '../config/awsConfig';

type PresignedUploadResponse = { url: string; key: string };

/** For flow: presign → upload to S3 → POST /videos. Key = videoId/original.mp4 so transcoder gets clear path. */
export type PresignedVideoUploadResponse = { url: string; key: string; videoId: string };

// `requestChecksumCalculation: WHEN_REQUIRED` keeps the SDK from baking a
// CRC32 checksum (of an empty body) into presigned PUT URLs — otherwise the
// browser's direct upload fails with a checksum/signature mismatch.
const createS3Client = () =>
  new S3Client({
    ...awsClientConfig(),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

const s3Client = createS3Client();
const ensuredBuckets = new Set<string>();

// Allow the browser to PUT directly to the bucket via presigned URLs.
const applyBucketCors = async (bucket: string) => {
  const origins = (process.env.S3_CORS_ALLOWED_ORIGINS || process.env.CLIENT_URL || '*')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  await s3Client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedOrigins: origins,
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );
};

const ensureBucketExists = async (bucket: string) => {
  if (ensuredBuckets.has(bucket)) return;

  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    const code = error?.Code || error?.code || error?.name;

    // If bucket truly does not exist, create it. Otherwise rethrow.
    if (status === 404 || code === 'NotFound' || code === 'NoSuchBucket') {
      const createParams: any = { Bucket: bucket };

      // For real AWS in non-us-east-1 we must specify LocationConstraint.
      if (!process.env.S3_ENDPOINT && region !== 'us-east-1') {
        createParams.CreateBucketConfiguration = { LocationConstraint: region };
      }

      await s3Client.send(new CreateBucketCommand(createParams));
    } else {
      throw error;
    }
  }

  await applyBucketCors(bucket);
  ensuredBuckets.add(bucket);
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

export const deleteS3Object = async (bucket: string, key: string): Promise<void> => {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};

// Delete every object under a prefix (paginated) — used for HLS segment dirs.
export const deleteS3Prefix = async (bucket: string, prefix: string): Promise<void> => {
  let token: string | undefined;
  do {
    const listed = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objects.length) {
      await s3Client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
};

// Best-effort removal of a video's S3 artifacts: original upload + HLS output.
export const deleteVideoS3Artifacts = async (
  originalKey: string | null,
  videoId: string
): Promise<void> => {
  const rawBucket = process.env.S3_RAW_VIDEO_BUCKET;
  const processedBucket = process.env.S3_PROCESSED_VIDEO_BUCKET || 'processed-video';
  const tasks: Promise<void>[] = [];
  if (rawBucket && originalKey) tasks.push(deleteS3Object(rawBucket, originalKey));
  // Transcoder uploads HLS under `{videoId}/` in the processed bucket.
  if (processedBucket) tasks.push(deleteS3Prefix(processedBucket, `${videoId}/`));

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('[S3] Failed to delete video artifact:', r.reason);
  });
};