import { PrismaClient } from '@prisma/client';
import { publishVideoUploaded } from './kafka.service';
import { deleteVideoS3Artifacts } from './s3.service';

const prisma = new PrismaClient();

const RESOLUTIONS = ['240p', '480p', '720p', '1080p'];

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
    resolutions: RESOLUTIONS,
  });

  return video;
};

export interface MarkProcessedInput {
  videoId: string;
  status: 'TRANSCODING' | 'READY' | 'FAILED';
  hlsMasterPath?: string;
  error?: string;
}

export const markVideoProcessed = async (input: MarkProcessedInput) => {
  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
  });

  if (!video) {
    throw new Error('Video not found');
  }

  await prisma.video.update({
    where: { id: input.videoId },
    data: {
      status: input.status,
      hlsMasterPath: input.hlsMasterPath ?? null,
      ...(input.error && { metadata: { error: input.error } as object }),
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

export interface UpdateVideoInput {
  title?: string;
  description?: string | null;
}

export const updateVideoRecord = async (videoId: string, data: UpdateVideoInput) =>
  prisma.video.update({ where: { id: videoId }, data });

// Removes transcode jobs + the video row, then best-effort deletes its S3 artifacts.
export const deleteVideoRecord = async (videoId: string) => {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return null;

  await prisma.videoTranscodeJob.deleteMany({ where: { videoId } });
  await prisma.video.delete({ where: { id: videoId } });
  await deleteVideoS3Artifacts(video.originalKey, video.id);

  return video;
};
