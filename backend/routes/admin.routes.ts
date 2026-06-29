import express from 'express';
import { isAuthenticated, authorizedRoles } from '../middleware/auth';
import {
  listInstructorRequests,
  approveInstructorRequest,
  rejectInstructorRequest,
} from '../controllers/instructorRequest.controller';
import { getUsers, changeUserRole } from '../controllers/admin.controller';

const router = express.Router();

// All admin routes require an ADMIN.
router.use(isAuthenticated, authorizedRoles('ADMIN'));

router.get('/instructor-requests', listInstructorRequests);
router.post('/instructor-requests/:id/approve', approveInstructorRequest);
router.post('/instructor-requests/:id/reject', rejectInstructorRequest);

router.get('/users', getUsers);
router.patch('/users/:id/role', changeUserRole);

export default router;
