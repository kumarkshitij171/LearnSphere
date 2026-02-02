import {
  generatePresignedURL,
  presignVideoUpload,
  confirmVideoUpload,
  videoProcessed,
  getVideo,
} from '../controllers/videoUpload.controller';
import { authorizedRoles, isAuthenticated } from '../middleware/auth';
import { transcoderApiKeyAuth } from '../middleware/transcoderAuth';
import express from 'express';

const router = express.Router();

// Legacy
router.post(
  '/generate-presigned-url',
  isAuthenticated,
  authorizedRoles('user'),
  generatePresignedURL
);

// Presign: get uploadUrl + videoId (key = videoId/original.mp4)
router.post(
  '/presign',
  isAuthenticated,
  authorizedRoles('user'),
  presignVideoUpload
);

// Confirm upload: save metadata, publish Kafka
router.post(
  '/',
  isAuthenticated,
  authorizedRoles('user'),
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

export default router;
