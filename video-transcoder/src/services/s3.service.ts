import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createWriteStream,
  readFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
} from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { config } from '../config/conf.js';
import { logger } from '../utils/logger.js';

// Initialize S3 client (omit endpoint when undefined for AWS; set for MinIO/local)
const s3Client = new S3Client({
  region: config.aws.region || 'us-east-1',
  credentials: {
    accessKeyId: config.aws.accessKeyId || '',
    secretAccessKey: config.aws.secretAccessKey || '',
  },
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

/** Content type for HLS playlists and segments */
const contentTypeFor = (key: string): string => {
  if (key.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (key.endsWith('.ts')) return 'video/MP2T';
  return 'application/octet-stream';
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

/**
 * Clean up temporary files and directories
 */
export const cleanupTempFiles = (paths: string[]): void => {
  paths.forEach((path) => {
    try {
      if (existsSync(path)) {
        if (existsSync(path) && require('fs').statSync(path).isDirectory()) {
          rmSync(path, { recursive: true, force: true });
        } else {
          unlinkSync(path);
        }
        logger.debug(`Cleaned up: ${path}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${path}`, { error });
    }
  });
};
