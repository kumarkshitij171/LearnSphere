import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from '../../routes/user.routes';
import courseRoutes from '../../routes/course.routes';
import videoUploadRoutes from '../../routes/videoUpload.routes';
import instructorRequestRoutes from '../../routes/instructorRequest.routes';
import adminRoutes from '../../routes/admin.routes';
import internalRoutes from '../../routes/internal.routes';
import { uiConfigPublicRoutes } from '../../routes/uiConfig.routes';
import { ErrorMiddleWare } from '../../middleware/error';

// Real routes + error middleware, minus the rate limiters and env check from app.ts.
export const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/courses', courseRoutes);
  app.use('/api/v1/video-upload', videoUploadRoutes);
  app.use('/api/v1/instructor-requests', instructorRequestRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/internal', internalRoutes);
  app.use('/api/v1/ui-config', uiConfigPublicRoutes);
  app.use(ErrorMiddleWare);
  return app;
};
