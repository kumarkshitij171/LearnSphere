import { PrismaClient } from '@prisma/client';
import { publishVideoUploaded } from './kafka.service';
import { deleteS3Prefix, deleteVideoS3Artifacts } from './s3.service';
import { removeThumbnail } from './asset.service';
import type { RenditionReport, TranscodeErrorCode } from '../utils/validation';

const prisma = new PrismaClient();

export interface CreateVideoInput {
  videoId: string;
  userId: string;
  courseId: string;
  originalKey: string;
  title: string;
  description?: string;
  duration?: number;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
}

export const createVideoRecord = async (input: CreateVideoInput) => {
  const bucket = process.env.S3_RAW_VIDEO_BUCKET;
  if (!bucket) {
    throw new Error('S3_RAW_VIDEO_BUCKET is not configured');
  }

  const video = await prisma.video.create({
    data: {
      id: input.videoId,
      userId: input.userId,
      courseId: input.courseId,
      originalKey: input.originalKey,
      title: input.title,
      description: input.description ?? null,
      duration: input.duration ?? null,
      mimeType: input.mimeType,
      fileName: input.fileName ?? null,
      fileSize: input.fileSize ?? null,
      status: 'UPLOADED',
      resolutions: [],
    },
  });

  const inputS3Path = `s3://${bucket}/${input.originalKey}`;
  await publishVideoUploaded({
    videoId: input.videoId,
    userId: input.userId,
    bucket,
    key: input.originalKey,
    inputS3Path,
  });

  return video;
};

export interface MarkProcessedInput {
  videoId: string;
  status: 'TRANSCODING' | 'READY' | 'FAILED';
  hlsMasterPath?: string;
  error?: string;
  errorCode?: TranscodeErrorCode;
  duration?: number;
  resolutions?: RenditionReport[];
}

// null when the video is gone (deleted mid-transcode), so the caller can answer 404
export const markVideoProcessed = async (input: MarkProcessedInput) => {
  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
  });

  if (!video) return null;

  const failure = {
    ...(input.error && { error: input.error }),
    ...(input.errorCode && { errorCode: input.errorCode }),
  };
  await prisma.video.update({
    where: { id: input.videoId },
    data: {
      status: input.status,
      hlsMasterPath: input.hlsMasterPath ?? null,
      ...(input.duration !== undefined && { duration: input.duration }),
      ...(input.resolutions && { resolutions: input.resolutions }),
      ...(Object.keys(failure).length > 0 && { metadata: failure }),
    },
  });

  return prisma.video.findUnique({ where: { id: input.videoId } });
};

export const getVideoById = async (videoId: string) => {
  return prisma.video.findUnique({
    where: { id: videoId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
};

export const findVideoThumbnail = (videoId: string) =>
  prisma.video.findUnique({ where: { id: videoId }, select: { id: true, thumbnail: true } });

export interface UpdateVideoInput {
  title?: string;
  description?: string | null;
  thumbnail?: string | null;
}

export const updateVideoRecord = async (videoId: string, data: UpdateVideoInput) =>
  prisma.video.update({ where: { id: videoId }, data });

// Removes transcode jobs + the video row, then best-effort deletes its S3 artifacts and thumbnail.
export const deleteVideoRecord = async (videoId: string) => {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return null;

  await prisma.videoTranscodeJob.deleteMany({ where: { videoId } });
  await prisma.video.delete({ where: { id: videoId } });
  await deleteVideoS3Artifacts(video.originalKey, video.id);
  await removeThumbnail('lesson', video.id, video.thumbnail);

  return video;
};

export interface ReplacementFile {
  mimeType: string;
  fileName?: string;
  fileSize?: number;
}

/**
 * Sends a lesson through transcoding again — after its file was replaced, or to retry a failure.
 * The lesson keeps its id, title and position; its old renditions are removed first so a smaller
 * new ladder cannot leave stale higher rungs behind.
 */
export const requeueVideo = async (
  video: { id: string; userId: string; originalKey: string },
  file?: ReplacementFile
) => {
  const bucket = process.env.S3_RAW_VIDEO_BUCKET;
  if (!bucket) throw new Error('S3_RAW_VIDEO_BUCKET is not configured');
  const processedBucket = process.env.S3_PROCESSED_VIDEO_BUCKET || 'processed-video';
  await deleteS3Prefix(processedBucket, `${video.id}/`).catch((error) =>
    console.error('[S3] Could not clear old renditions before re-transcoding:', error)
  );

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      status: 'UPLOADED',
      hlsMasterPath: null,
      duration: null,
      resolutions: [],
      metadata: {},
      ...(file && {
        mimeType: file.mimeType,
        fileName: file.fileName ?? null,
        fileSize: file.fileSize ?? null,
      }),
    },
  });
  await publishVideoUploaded({
    videoId: video.id,
    userId: video.userId,
    bucket,
    key: video.originalKey,
    inputS3Path: `s3://${bucket}/${video.originalKey}`,
  });
  return updated;
};

