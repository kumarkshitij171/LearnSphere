import { NextFunction, Request, Response } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import {
  generatePresignedUploadURL,
  generatePresignedUploadURLForVideo,
  s3ObjectExists,
} from '../services/s3.service';
import {
  createVideoRecord,
  markVideoProcessed,
  getVideoById,
  updateVideoRecord,
  deleteVideoRecord,
  requeueVideo,
} from '../services/video.service';
import { isEnrolled } from '../services/course.service';
import { transcodeReportExtras } from '../utils/validation';
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
      courseId,
      originalS3Path,
      originalKey,
      title,
      description,
      duration,
      mimeType,
      fileName,
      fileSize,
    } = req.body;

    if (!videoId || !courseId || !title || !mimeType) {
      return next(
        new ErrorHandler(400, 'videoId, courseId, title, and mimeType are required')
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
      courseId,
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
 * Body: { status: "TRANSCODING" | "READY" | "FAILED", hlsMasterPath?, error?, errorCode?,
 *         duration? (whole seconds), resolutions? ([{ label, width, height, bandwidth }]) }
 */
export const videoProcessed = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    const { status, hlsMasterPath, error } = req.body;
    const { duration, resolutions, errorCode, ignored } = transcodeReportExtras(req.body);

    if (!videoId) {
      return next(new ErrorHandler(400, 'videoId is required'));
    }
    if (!status || !['TRANSCODING', 'READY', 'FAILED'].includes(status)) {
      return next(new ErrorHandler(400, 'status must be TRANSCODING, READY, or FAILED'));
    }
    if (status === 'READY' && !hlsMasterPath) {
      return next(new ErrorHandler(400, 'hlsMasterPath is required when status is READY'));
    }

    if (ignored.length) {
      console.warn(`[video-upload] ${videoId}: ignoring malformed ${ignored.join(', ')} from the transcoder`);
    }

    const video = await markVideoProcessed({
      videoId,
      status,
      hlsMasterPath,
      error,
      errorCode,
      duration,
      resolutions,
    });
    // a 4xx tells the transcoder to stop reporting; a 500 would have Kafka redeliver the job forever
    if (!video) {
      return next(new ErrorHandler(404, 'Video not found'));
    }

    return res.status(200).json({
      success: true,
      video: {
        id: video.id,
        status: video.status,
        hlsMasterPath: video.hlsMasterPath,
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

    // Owner/admin always; otherwise the requester must be enrolled in the course.
    const isOwner = video.userId === req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      const enrolled = video.courseId
        ? await isEnrolled(req.user!.id, video.courseId)
        : false;
      if (!enrolled) {
        return next(new ErrorHandler(403, 'You must be enrolled to view this video'));
      }
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

// The uploader is the course's instructor; admins always pass.
const canManageVideo = (video: { userId: string }, req: Request) =>
  req.user!.role === 'ADMIN' || video.userId === req.user!.id;

/** PATCH /videos/:videoId — update title/description (owner/admin). */
export const updateVideo = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    const video = await getVideoById(videoId);
    if (!video) return next(new ErrorHandler(404, 'Video not found'));
    if (!canManageVideo(video, req)) {
      return next(new ErrorHandler(403, 'You do not have permission to modify this video'));
    }

    const { title, description } = req.body;
    const updated = await updateVideoRecord(videoId, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
    });

    return res.status(200).json({
      success: true,
      video: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        status: updated.status,
      },
    });
  }
);

/** DELETE /videos/:videoId — remove the video + its S3 artifacts (owner/admin). */
export const deleteVideo = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const { videoId } = req.params;
    const video = await getVideoById(videoId);
    if (!video) return next(new ErrorHandler(404, 'Video not found'));
    if (!canManageVideo(video, req)) {
      return next(new ErrorHandler(403, 'You do not have permission to delete this video'));
    }

    await deleteVideoRecord(videoId);
    return res.status(200).json({ success: true, message: 'Video deleted' });
  }
);

const lessonView = (v: { id: string; title: string; description: string | null; status: string }) => ({
  id: v.id,
  title: v.title,
  description: v.description,
  status: v.status,
});

/** POST /video-upload/:videoId/replace/presign — an upload URL for a new file under the same lesson. */
export const presignReplacement = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const video = await getVideoById(req.params.videoId);
  if (!video) return next(new ErrorHandler(404, 'Video not found'));
  if (!canManageVideo(video, req)) return next(new ErrorHandler(403, 'You do not have permission to modify this video'));
  const contentType = req.body?.contentType ?? 'video/mp4';
  const { url, key } = await generatePresignedUploadURLForVideo(video.id, contentType);
  return res.status(200).json({ uploadUrl: url, videoId: video.id, key });
});

/** POST /video-upload/:videoId/replace — the new file is uploaded; transcode it in place of the old one. */
export const confirmReplacement = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const video = await getVideoById(req.params.videoId);
  if (!video) return next(new ErrorHandler(404, 'Video not found'));
  if (!canManageVideo(video, req)) return next(new ErrorHandler(403, 'You do not have permission to modify this video'));
  const { mimeType, fileName, fileSize } = req.body ?? {};
  if (typeof mimeType !== 'string' || !mimeType) return next(new ErrorHandler(400, 'mimeType is required'));
  const bucket = process.env.S3_RAW_VIDEO_BUCKET!;
  if (!(await s3ObjectExists(bucket, video.originalKey))) {
    return next(new ErrorHandler(409, 'The new file has not finished uploading'));
  }
  const updated = await requeueVideo(video, {
    mimeType,
    ...(typeof fileName === 'string' && { fileName }),
    ...(Number.isInteger(fileSize) && fileSize > 0 && { fileSize }),
  });
  return res.status(200).json({ success: true, video: lessonView(updated) });
});

/** POST /video-upload/:videoId/retry — transcode a failed lesson again from the original upload. */
export const retryVideo = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const video = await getVideoById(req.params.videoId);
  if (!video) return next(new ErrorHandler(404, 'Video not found'));
  if (!canManageVideo(video, req)) return next(new ErrorHandler(403, 'You do not have permission to modify this video'));
  if (video.status !== 'FAILED') return next(new ErrorHandler(409, 'Only a failed lesson can be retried'));
  const bucket = process.env.S3_RAW_VIDEO_BUCKET!;
  if (!(await s3ObjectExists(bucket, video.originalKey))) {
    return next(new ErrorHandler(409, 'The original file is no longer available — replace the video instead'));
  }
  const updated = await requeueVideo(video);
  return res.status(200).json({ success: true, video: lessonView(updated) });
});

