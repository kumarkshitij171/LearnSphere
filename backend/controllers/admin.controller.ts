import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import { listUsers, setUserRole } from '../services/admin.service';
import { listAllCourses } from '../services/course.service';

export const getUsers = catchAsyncError(async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const search = (req.query.search as string)?.trim() || undefined;
  const roleParam = req.query.role as string | undefined;
  const role = roleParam && Object.values(Role).includes(roleParam as Role) ? (roleParam as Role) : undefined;

  const result = await listUsers({ page, limit, search, role });
  return res.status(200).json({ success: true, ...result });
});

export const changeUserRole = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.body as { role?: string };
  if (!role || !Object.values(Role).includes(role as Role)) {
    return next(new ErrorHandler(400, `role must be one of: ${Object.values(Role).join(', ')}`));
  }
  // An admin can't change their own role (avoid self-lockout / accidental demotion).
  if (req.params.id === req.user!.id) {
    return next(new ErrorHandler(400, 'You cannot change your own role'));
  }
  const user = await setUserRole(req.params.id, role as Role);
  return res.status(200).json({ success: true, user });
});

export const getAllCourses = catchAsyncError(async (_req: Request, res: Response) => {
  const courses = await listAllCourses();
  return res.status(200).json({ success: true, courses });
});
