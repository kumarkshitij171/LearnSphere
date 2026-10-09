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
} from '../controllers/course.controller';
import { isAuthenticated, authorizedRoles } from '../middleware/auth';
import { requireCourseOwner } from '../middleware/ownership';
import { validate } from '../utils/validation';
import { createCourseSchema, updateCourseSchema } from '../utils/validation';

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
