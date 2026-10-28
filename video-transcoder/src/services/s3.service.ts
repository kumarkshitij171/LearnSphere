import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createWriteStream,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { config } from '../config/conf.js';
import { logger } from '../utils/logger.js';

// Endpoint is set for LocalStack and omitted for real AWS. Keys are passed only when set, so on
// AWS the SDK's default chain (IAM role, SSO, ~/.aws) supplies credentials.
const { accessKeyId, secretAccessKey } = config.aws;
const s3Client = new S3Client({
  region: config.aws.region || 'us-east-1',
  ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
  ...(config.s3?.endpoint && { endpoint: config.s3.endpoint }),
  forcePathStyle: config.s3?.forcePathStyle ?? false,
});

/**
 * Download video file from S3 to local filesystem
 */
export const downloadVideoFromS3 = async (
  bucket: string,
  key: string,
  localPath: string
): Promise<void> => {
  try {
    logger.info(`Downloading video from S3: ${bucket}/${key}`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    // Ensure directory exists
    const dir = localPath.substring(0, localPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Stream the file to local filesystem
    const writeStream = createWriteStream(localPath);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
    
    logger.info(`Video downloaded successfully to: ${localPath}`);
  } catch (error) {
    logger.error('Error downloading video from S3', { bucket, key, error });
    throw error;
  }
};

/**
 * Upload transcoded video file to S3
 */
export const uploadVideoToS3 = async (
  bucket: string,
  key: string,
  localPath: string
): Promise<void> => {
  try {
    logger.info(`Uploading video to S3: ${bucket}/${key}`);

    if (!existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const fileContent = readFileSync(localPath);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: 'video/mp4',
    });

    await s3Client.send(command);
    logger.info(`Video uploaded successfully to: ${bucket}/${key}`);
  } catch (error) {
    logger.error('Error uploading video to S3', { bucket, key, error });
    throw error;
  }
};

/** Content type for HLS playlists and segments, and the poster */
export const contentTypeFor = (key: string): string => {
  if (key.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (key.endsWith('.ts')) return 'video/MP2T';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
};

export interface S3ObjectStream {
  body: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number | undefined;
  contentRange?: string | undefined;
  acceptRanges?: string | undefined;
  statusCode: number; // 200, or 206 for a satisfied Range request
}

/**
 * Stream an object out of S3 for HLS playback (playlists + segments).
 * Passes through an optional HTTP Range so seeking works on segments.
 */
export const getS3ObjectStream = async (
  bucket: string,
  key: string,
  range?: string
): Promise<S3ObjectStream> => {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) })
  );
  if (!res.Body) throw new Error('Empty response body from S3');
  return {
    body: res.Body as NodeJS.ReadableStream,
    contentType: res.ContentType || contentTypeFor(key),
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    acceptRanges: res.AcceptRanges,
    statusCode: res.ContentRange ? 206 : 200,
  };
};

/**
 * Upload a single file to S3 with appropriate Content-Type (for HLS: .m3u8, .ts).
 */
export const uploadFileToS3 = async (
  bucket: string,
  key: string,
  localPath: string,
  contentType?: string
): Promise<void> => {
  if (!existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);
  const body = readFileSync(localPath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? contentTypeFor(key),
    })
  );
};

/**
 * Upload all files under a local directory to S3 with prefix.
 */
export const uploadDirectoryToS3 = async (
  bucket: string,
  s3Prefix: string,
  localDir: string
): Promise<void> => {
  const entries = readdirSync(localDir, { withFileTypes: true });
  for (const e of entries) {
    const localPath = join(localDir, e.name);
    const key = s3Prefix ? `${s3Prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      await uploadDirectoryToS3(bucket, key, localPath);
    } else {
      await uploadFileToS3(bucket, key, localPath);
    }
  }
};

/** Removes temp files and directories; never throws, since it runs on the failure path too. */
export const cleanupTempFiles = (paths: string[]): void => {
  for (const path of paths) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to cleanup ${path}`, { error });
    }
  }
};
