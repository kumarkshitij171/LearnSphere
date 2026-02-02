import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from './catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';

/**
 * Validates X-Transcoder-Api-Key or Authorization: Bearer <key> for internal transcoder callbacks.
 */
export const transcoderApiKeyAuth = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const apiKey =
      req.headers['x-transcoder-api-key'] ||
      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));

    const expectedKey = process.env.TRANCODER_API_KEY;
    if (!expectedKey) {
      return next(new ErrorHandler(500, 'TRANCODER_API_KEY is not configured'));
    }
    if (!apiKey || apiKey !== expectedKey) {
      return next(new ErrorHandler(401, 'Invalid or missing transcoder API key'));
    }
    next();
  }
);
