import { randomUUID } from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ensureBucketExists, s3Client } from './s3.service';
import { THUMBNAIL_TYPES, ThumbnailContentType } from '../utils/validation';

// Course and lesson images, uploaded by instructors straight to S3 like the videos are.

export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
export const THUMBNAIL_URL_TTL_SECONDS = 3600;
// The redirect is cached well inside the signed URL's lifetime, so a cached hop never lands on an
// expired URL. Cross-origin: <img> on another site must be able to follow it past helmet's default.
export const THUMBNAIL_REDIRECT_HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export type ThumbnailOwner = 'course' | 'lesson';
const FOLDERS: Record<ThumbnailOwner, string> = { course: 'course-thumbnails', lesson: 'lesson-thumbnails' };
const FILE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

export const assetBucket = () => process.env.S3_ASSET_BUCKET || 'course-assets';

const prefixFor = (owner: ThumbnailOwner, ownerId: string) => `${FOLDERS[owner]}/${ownerId}/`;

// Only a key this service minted for this course or lesson is ever trusted, signed or deleted.
export const isThumbnailKeyFor = (owner: ThumbnailOwner, ownerId: string, key: unknown): key is string => {
  if (typeof key !== 'string') return false;
  const prefix = prefixFor(owner, ownerId);
  return key.startsWith(prefix) && FILE_NAME.test(key.slice(prefix.length));
};

export const presignThumbnailUpload = async (
  owner: ThumbnailOwner,
  ownerId: string,
  contentType: ThumbnailContentType
) => {
  const bucket = assetBucket();
  await ensureBucketExists(bucket);
  const key = `${prefixFor(owner, ownerId)}${randomUUID()}.${THUMBNAIL_TYPES[contentType]}`;
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRY || '3600', 10) }
  );
  return { uploadUrl, key };
};

const headObject = async (key: string) => {
  try {
    return await s3Client.send(new HeadObjectCommand({ Bucket: assetBucket(), Key: key }));
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return null;
    throw error;
  }
};

/**
 * A presigned PUT cannot cap size or type, so both are checked once the upload exists. Returns why
 * the upload is refused, or null when it is fine. A refused upload is deleted, but only when the key
 * is this owner's: a key from another course must never be deletable through this one.
 */
export const verifyThumbnailUpload = async (
  owner: ThumbnailOwner,
  ownerId: string,
  key: string
): Promise<string | null> => {
  if (!isThumbnailKeyFor(owner, ownerId, key)) return `That upload does not belong to this ${owner}`;

  const head = await headObject(key);
  if (!head) return 'The image has not finished uploading';

  let problem: string | null = null;
  if ((head.ContentLength ?? 0) > MAX_THUMBNAIL_BYTES) problem = 'A thumbnail can be at most 5 MB';
  else if (!head.ContentType || !Object.prototype.hasOwnProperty.call(THUMBNAIL_TYPES, head.ContentType)) {
    problem = 'A thumbnail must be a JPEG, PNG or WebP image';
  }

  if (problem) await removeThumbnail(owner, ownerId, key);
  return problem;
};

export const presignThumbnailDownload = (key: string) =>
  getSignedUrl(s3Client, new GetObjectCommand({ Bucket: assetBucket(), Key: key }), {
    expiresIn: THUMBNAIL_URL_TTL_SECONDS,
  });

// Best-effort: an orphaned image costs a few KB, a failed delete must never fail the caller.
export const removeThumbnail = async (owner: ThumbnailOwner, ownerId: string, key: string | null | undefined) => {
  if (!isThumbnailKeyFor(owner, ownerId, key)) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: assetBucket(), Key: key }));
  } catch (error) {
    console.error(`[S3] Failed to delete ${owner} thumbnail ${key}:`, error);
  }
};
