import express from 'express';
import { internalApiKeyAuth } from '../middleware/internalAuth';
import { getCatalogueCourse, getCatalogueEnrollment } from '../controllers/internal.controller';

const router = express.Router();

// Every internal route is API-key authed; no user session is involved.
router.use(internalApiKeyAuth);

router.get('/courses/:courseId', getCatalogueCourse);
router.get('/enrollments/:userId/:courseId', getCatalogueEnrollment);

export default router;
