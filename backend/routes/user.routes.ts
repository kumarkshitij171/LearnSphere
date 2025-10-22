import express from 'express';
import { registerUser, verifyUser } from '../controllers/user.controller';

const router = express.Router();

router.post('/register', registerUser);
router.get('/verify',verifyUser);

export default router;