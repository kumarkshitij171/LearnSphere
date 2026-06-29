import express from 'express';
import {
  requestInstructor,
  myInstructorRequest,
} from '../controllers/instructorRequest.controller';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

router.post('/', isAuthenticated, requestInstructor);
router.get('/me', isAuthenticated, myInstructorRequest);

export default router;
