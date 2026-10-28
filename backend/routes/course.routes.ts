import express from 'express';
import {
  createCourse,
  listCourses,
  listMine,
  getCourse,
  updateCourse,
  deleteCourse,
  listEnrolled,
  rejectStudentEnroll,
  grantEnrollment,
  getCourseThumbnail,
  presignCourseThumbnail,
  confirmCourseThumbnail,
  deleteCourseThumbnail,
} from '../controllers/course.controller';
import { isAuthenticated, authorizedRoles } from '../middleware/auth';
import { requireCourseOwner } from '../middleware/ownership';
import { validate } from '../utils/validation';
import {
  createCourseSchema,
  updateCourseSchema,
  thumbnailPresignSchema,
  thumbnailConfirmSchema,
} from '../utils/validation';

const router = express.Router();

router.get('/', isAuthenticated, listCourses);
router.get('/mine', isAuthenticated, authorizedRoles('INSTRUCTOR'), listMine);
router.get('/enrolled', isAuthenticated, listEnrolled);

router.post(
  '/',
  isAuthenticated,
  authorizedRoles('INSTRUCTOR'),
  validate(createCourseSchema),
  createCourse
);

// Public: course art is not secret, and an <img> cannot attach a bearer token.
router.get('/:courseId/thumbnail', getCourseThumbnail);
router.post(
  '/:courseId/thumbnail/presign',
  isAuthenticated,
  requireCourseOwner,
  validate(thumbnailPresignSchema),
  presignCourseThumbnail
);
router.put(
  '/:courseId/thumbnail',
  isAuthenticated,
  requireCourseOwner,
  validate(thumbnailConfirmSchema),
  confirmCourseThumbnail
);
router.delete('/:courseId/thumbnail', isAuthenticated, requireCourseOwner, deleteCourseThumbnail);

router.get('/:courseId', isAuthenticated, getCourse);

router.patch(
  '/:courseId',
  isAuthenticated,
  requireCourseOwner,
  validate(updateCourseSchema),
  updateCourse
);

router.delete('/:courseId', isAuthenticated, requireCourseOwner, deleteCourse);

// Grant endpoint for the course instructor or an admin; students get 402 { requiresOrder }.
router.post('/:courseId/enroll', isAuthenticated, rejectStudentEnroll, requireCourseOwner, grantEnrollment);

export default router;
