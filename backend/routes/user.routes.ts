import express from 'express';
import { loginUser, registerUser, reverifyUser, verifyUser } from '../controllers/user.controller';

const router = express.Router();

router.post('/register', registerUser);
router.get('/verify',verifyUser);
router.get('/reverify-email',reverifyUser);
router.post('/login',loginUser)

export default router;