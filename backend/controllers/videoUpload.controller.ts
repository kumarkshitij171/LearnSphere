import { NextFunction, Request, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import {
  generatePresignedUploadURL,
  generatePresignedUploadURLForVideo,
} from '../services/s3.service';
import { createVideoRecord, markVideoProcessed, getVideoById } from '../services/video.service';
import { randomUUID } from 'crypto';

/** Legacy: presigned URL with random key (uploads/userId/uuid-filename). */
export const generatePresignedURL = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req?.user?.id;
    if (!userId) {
      return next(new ErrorHandler(400, 'User not found'));
    }
    const { fileName, contentType } = req.body;
    if (!fileName || !contentType) {
      return next(new ErrorHandler(400, 'fileName and contentType are required'));
    }
    const { url, key } = await generatePresignedUploadURL(fileName, contentType, userId);
    return res.status(200).json({ url, key });
  }
);

/**
 * POST /videos/presign
 * Returns videoId + presigned URL for uploading original video. Key = videoId/original.mp4.
 * Frontend: 1) call this → 2) PUT to url → 3) POST /videos with metadata.
 */
export const presignVideoUpload = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req?.user?.id;
    if (!userId) {
      return next(new ErrorHandler(400, 'User not found'));
    }
    const contentType = req.body?.contentType ?? 'video/mp4';
    const videoId = randomUUID();
    const { url, key } = await generatePresignedUploadURLForVideo(videoId, contentType);
    return res.status(200).json({ uploadUrl: url, videoId, key });
  }
);

/**
 * POST /videos
 * Body: { videoId, originalS3Path or originalKey, title, description?, duration?, mimeType, fileName?, fileSize? }
 * Creates video record and publishes Kafka event for transcoder.
 */
export const confirmVideoUpload = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req?.user?.id;
    if (!userId) {
      return next(new ErrorHandler(400, 'User not found'));
    }
    const {
      videoId,
      originalS3Path,
      originalKey,
      title,
      description,
      duration,
      mimeType,
      fileName,
      fileSize,
    } = req.body;

    if (!videoId || !title || !mimeType) {
      return next(
        new ErrorHandler(400, 'videoId, title, and mimeType are required')
      );
    }

    const bucket = process.env.S3_RAW_VIDEO_BUCKET;
    if (!bucket) {
      return next(new ErrorHandler(500, 'S3_RAW_VIDEO_BUCKET is not configured'));
    }

    let key: string;
    if (originalKey) {
      key = originalKey;
    } else if (originalS3Path) {
      const match = originalS3Path.match(new RegExp(`s3://${bucket}/(.+)`));
      key = match ? match[1] : `${videoId}/original.mp4`;
    } else {
      key = `${videoId}/original.mp4`;
    }

    const video = await createVideoRecord({
      videoId,
      userId,
      originalKey: key,
      title,
      description,
      duration: duration != null ? Number(duration) : undefined,
      mimeType,
      fileName,
      fileSize: fileSize != null ? Number(fileSize) : undefined,
    });

    return res.status(201).json({
      success: true,
      video: {
        id: video.id,
        status: video.status,
        title: video.title,
        originalKey: video.originalKey,
      },
    });
  }
);

/**
 * POST /videos/:videoId/processed
 * Called by video-transcoder service. Requires X-Transcoder-Api-Key.
 * Body: { status: "READY" | "FAILED", hlsMasterPath?, error? }
 */
export const videoProcessed = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    const { status, hlsMasterPath, error } = req.body;

    if (!videoId) {
      return next(new ErrorHandler(400, 'videoId is required'));
    }
    if (!status || !['TRANSCODING', 'READY', 'FAILED'].includes(status)) {
      return next(new ErrorHandler(400, 'status must be TRANSCODING, READY, or FAILED'));
    }
    if (status === 'READY' && !hlsMasterPath) {
      return next(new ErrorHandler(400, 'hlsMasterPath is required when status is READY'));
    }

    const video = await markVideoProcessed({
      videoId,
      status,
      hlsMasterPath,
      error,
    });

    return res.status(200).json({
      success: true,
      video: {
        id: video?.id,
        status: video?.status,
        hlsMasterPath: video?.hlsMasterPath,
      },
    });
  }
);

/**
 * GET /videos/:videoId
 * Returns video metadata including hlsMasterPath for playback (when status === READY).
 */
export const getVideo = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    if (!videoId) {
      return next(new ErrorHandler(400, 'videoId is required'));
    }
    const video = await getVideoById(videoId);
    if (!video) {
      return next(new ErrorHandler(404, 'Video not found'));
    }
    return res.status(200).json({
      success: true,
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        duration: video.duration,
        status: video.status,
        hlsMasterPath: video.hlsMasterPath,
        createdAt: video.createdAt,
      },
    });
  }
);
