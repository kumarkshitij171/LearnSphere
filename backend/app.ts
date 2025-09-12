import express, { Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import userRoutes from './routes/user.routes';
import { ErrorMiddleWare } from './middleware/error';

dotenv.config();

export const app = express();
// body parser
app.use(express.json({ limit: '50mb' }));
// cookie parser
app.use(cookieParser());

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));


// Routes
app.use('/api/v1/users', userRoutes);

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