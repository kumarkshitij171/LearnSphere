import {
  generatePresignedURL,
  presignVideoUpload,
  confirmVideoUpload,
  videoProcessed,
  getVideo,
  updateVideo,
  deleteVideo,
  presignReplacement,
  confirmReplacement,
  retryVideo,
  getLessonThumbnail,
  presignLessonThumbnail,
  confirmLessonThumbnail,
  deleteLessonThumbnail,
} from '../controllers/videoUpload.controller';
import { authorizedRoles, isAuthenticated } from '../middleware/auth';
import { requireCourseOwner } from '../middleware/ownership';
import { transcoderApiKeyAuth } from '../middleware/transcoderAuth';
import {
  validate,
  updateVideoSchema,
  thumbnailPresignSchema,
  thumbnailConfirmSchema,
} from '../utils/validation';
import express from 'express';

const router = express.Router();

// Legacy
router.post(
  '/generate-presigned-url',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  generatePresignedURL
);

// Presign: get uploadUrl + videoId (key = videoId/original.mp4) for an owned course
router.post(
  '/presign',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  requireCourseOwner,
  presignVideoUpload
);

// Confirm upload: save metadata, publish Kafka (must own the target course)
router.post(
  '/',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  requireCourseOwner,
  confirmVideoUpload
);

// Transcoder callback: update status + hlsMasterPath (API key auth)
router.post(
  '/:videoId/processed',
  transcoderApiKeyAuth,
  videoProcessed
);

// Get video metadata (for playback URL; auth optional depending on your rules)
// replace a lesson's file, or retry a failed one, without losing the lesson (owner/admin)
router.post('/:videoId/replace/presign', isAuthenticated, authorizedRoles('INSTRUCTOR'), presignReplacement);
router.post('/:videoId/replace', isAuthenticated, authorizedRoles('INSTRUCTOR'), confirmReplacement);
router.post('/:videoId/retry', isAuthenticated, authorizedRoles('INSTRUCTOR'), retryVideo);

// Lesson thumbnail: public read for <img>; writes for the lesson's owner (checked in the controller)
router.get('/:videoId/thumbnail', getLessonThumbnail);
router.post(
  '/:videoId/thumbnail/presign',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  validate(thumbnailPresignSchema),
  presignLessonThumbnail
);
router.put(
  '/:videoId/thumbnail',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  validate(thumbnailConfirmSchema),
  confirmLessonThumbnail
);
router.delete('/:videoId/thumbnail', isAuthenticated, authorizedRoles('INSTRUCTOR'), deleteLessonThumbnail);

router.get(
  '/:videoId',
  isAuthenticated,
  getVideo
);

// Update video metadata (title/description) — owner instructor or admin
router.patch(
  '/:videoId',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  validate(updateVideoSchema),
  updateVideo
);

// Delete a video + its S3 artifacts — owner instructor or admin
router.delete(
  '/:videoId',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  deleteVideo
);

export default router;
