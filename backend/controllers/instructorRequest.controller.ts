import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import {
  createRequest,
  getMyRequest,
  listRequests,
  approveRequest,
  rejectRequest,
} from '../services/instructorRequest.service';

export const requestInstructor = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  if (req.user!.role === 'INSTRUCTOR' || req.user!.role === 'ADMIN') {
    return next(new ErrorHandler(400, 'You already have instructor access'));
  }
  const result = await createRequest(req.user!.id, req.body?.message);
  if (!result.ok) return next(new ErrorHandler(409, 'You already have a pending request'));
  return res.status(201).json({ success: true, request: result.request });
});

export const myInstructorRequest = catchAsyncError(async (req: Request, res: Response) => {
  const request = await getMyRequest(req.user!.id);
  return res.status(200).json({ success: true, request });
});

export const listInstructorRequests = catchAsyncError(async (req: Request, res: Response) => {
  const status = req.query.status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined;
  const requests = await listRequests(status);
  return res.status(200).json({ success: true, requests });
});

export const approveInstructorRequest = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const result = await approveRequest(req.params.id, req.user!.id);
  if (!result.ok) return next(new ErrorHandler(404, 'Request not found'));
  return res.status(200).json({ success: true, request: result.request });
});

export const rejectInstructorRequest = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const result = await rejectRequest(req.params.id, req.user!.id);
  if (!result.ok) return next(new ErrorHandler(404, 'Request not found'));
  return res.status(200).json({ success: true, request: result.request });
});
