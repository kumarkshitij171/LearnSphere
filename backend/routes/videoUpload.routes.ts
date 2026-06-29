import {
  generatePresignedURL,
  presignVideoUpload,
  confirmVideoUpload,
  videoProcessed,
  getVideo,
  updateVideo,
  deleteVideo,
} from '../controllers/videoUpload.controller';
import { authorizedRoles, isAuthenticated } from '../middleware/auth';
import { requireCourseOwner } from '../middleware/ownership';
import { transcoderApiKeyAuth } from '../middleware/transcoderAuth';
import { validate, updateVideoSchema } from '../utils/validation';
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
