// must stay first: modules below read process.env while they load
import 'dotenv/config';
import express, { Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
import userRoutes from './routes/user.routes';
import { ErrorMiddleWare } from './middleware/error';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { weakSecrets } from './utils/secretPolicy';
import videoUploadRoutes from './routes/videoUpload.routes';
import courseRoutes from './routes/course.routes';
import instructorRequestRoutes from './routes/instructorRequest.routes';
import adminRoutes from './routes/admin.routes';
import internalRoutes from './routes/internal.routes';
import { uiConfigPublicRoutes } from './routes/uiConfig.routes';


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

// in production a weak or sample secret means anyone can mint tokens, so refuse to start
if (process.env.NODE_ENV === 'production') {
    const sample = Object.fromEntries(
        (existsSync(join(__dirname, '.env.sample')) ? readFileSync(join(__dirname, '.env.sample'), 'utf8') : '')
            .split('\n')
            .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*['"]?([^'"#]*?)['"]?\s*$/))
            .filter((m): m is RegExpMatchArray => Boolean(m))
            .map((m) => [m[1], m[2]])
    );
    const problems = weakSecrets(process.env, sample);
    if (problems.length) {
        console.error('Refusing to start with weak secrets:\n  ' + problems.join('\n  '));
        process.exit(1);
    }
}

export const app = express();

// standard hardening headers (nosniff, frameguard, HSTS, …) and no framework banner
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many verification attempts. Please wait a few minutes and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many codes requested. Please wait a few minutes and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General rate limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.RATE_LIMIT_MAX) || 1000, // per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    // Don't throttle service-to-service calls (API-key authed): the transcoder's
    // status callbacks and order-service's catalogue lookups.
    skip: (req) =>
        Boolean(req.headers['x-transcoder-api-key'] || req.headers['x-internal-api-key']),
});

// body parser
app.use(express.json({ limit: '50mb' }));
// cookie parser
app.use(cookieParser());

app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Mobile-App', 'X-Verification-Token', 'X-Token', 'If-None-Match'],
    exposedHeaders: ['ETag']
}));

// Apply general rate limiting
app.use('/api/v1', generalLimiter);

// Routes
// Apply auth rate limiting to login and register
app.use('/api/v1/users/login', authLimiter);
app.use('/api/v1/users/register', authLimiter);
// a 6-digit code also has per-code attempt limits; these stop one IP spraying many codes or emails
app.use('/api/v1/users/verify', verifyLimiter);
app.use('/api/v1/users/reverify-email', resendLimiter);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/video-upload', videoUploadRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructor-requests', instructorRequestRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/internal', internalRoutes);
app.use('/api/v1/ui-config', uiConfigPublicRoutes);

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