import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from './catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';

/**
 * Service-to-service auth for /api/v1/internal/*. Mirrors transcoderAuth: these
 * routes are called by other services (order-service), never by a browser.
 */
export const internalApiKeyAuth = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const apiKey =
      req.headers['x-internal-api-key'] ||
      (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, ''));

    const expectedKey = process.env.INTERNAL_API_KEY;
    if (!expectedKey) {
      return next(new ErrorHandler(500, 'INTERNAL_API_KEY is not configured'));
    }
    if (!apiKey || apiKey !== expectedKey) {
      return next(new ErrorHandler(401, 'Invalid or missing internal API key'));
    }
    next();
  }
);
