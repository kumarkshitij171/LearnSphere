import express from 'express';
import { loginUser, logoutUser, registerUser, reverifyUser, verifyUser, refreshAccessToken } from '../controllers/user.controller';
import { isAuthenticated } from '../middleware/auth';
import { validate, validateVerify } from '../utils/validation';
import { registerUserSchema, loginUserSchema, verifyUserSchema, refreshTokenSchema } from '../utils/validation';

const router = express.Router();

router.post('/register', validate(registerUserSchema), registerUser);
router.post('/verify', validateVerify(verifyUserSchema), verifyUser);
router.get('/verify', validateVerify(verifyUserSchema), verifyUser); // Supports token from header, query, or cookie
router.get('/reverify-email', reverifyUser);
router.post('/login', validate(loginUserSchema), loginUser);
router.post('/refresh-token', validate(refreshTokenSchema), refreshAccessToken);
router.get("/logout", isAuthenticated, logoutUser);

export default router;