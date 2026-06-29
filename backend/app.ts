import express, { Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import userRoutes from './routes/user.routes';
import { ErrorMiddleWare } from './middleware/error';
import rateLimit from 'express-rate-limit';
import videoUploadRoutes from './routes/videoUpload.routes';
import courseRoutes from './routes/course.routes';
import instructorRequestRoutes from './routes/instructorRequest.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'JWT_SECRET',
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'CLIENT_URL'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

export const app = express();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// General rate limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.RATE_LIMIT_MAX) || 1000, // per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    // Don't throttle the transcoder's internal status callbacks (API-key authed).
    skip: (req) => Boolean(req.headers['x-transcoder-api-key']),
});

// body parser
app.use(express.json({ limit: '50mb' }));
// cookie parser
app.use(cookieParser());

app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Mobile-App', 'X-Verification-Token', 'X-Token']
}));

// Apply general rate limiting
app.use('/api/v1', generalLimiter);

// Routes
// Apply auth rate limiting to login and register
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/register', authLimiter);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/video-upload', videoUploadRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructor-requests', instructorRequestRoutes);
app.use('/api/v1/admin', adminRoutes);

// health route
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running'
    })
})


// for unknown routes
app.all('*', (req: Request, res: Response) => {
    return res.status(404).json({
        success: false,
        message: 'Page not found'
    });
});

app.use(ErrorMiddleWare);