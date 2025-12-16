import { generatePresignedURL } from "../controllers/videoUpload.controller";
import { authorizedRoles, isAuthenticated } from "../middleware/auth";
import express from "express";
import { validate } from "../utils/validation";

const router = express.Router();

router.post('/generate-presigned-url', isAuthenticated, authorizedRoles('user'), generatePresignedURL);

export default router;