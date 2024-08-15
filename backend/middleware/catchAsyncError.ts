import { NextFunction, Request, Response } from 'express';
// This snippet is a middleware function that catches any async errors that are thrown in the controller functions.
export const catchAsyncError = (fn: any) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    }
}