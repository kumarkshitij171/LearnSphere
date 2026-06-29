import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { catchAsyncError } from './catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';

const prisma = new PrismaClient();

// Allows the course's instructor (or any admin) through; attaches req.course.
export const requireCourseOwner = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const courseId = req.params.courseId || req.body.courseId;
    if (!courseId) {
      return next(new ErrorHandler(400, 'courseId is required'));
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return next(new ErrorHandler(404, 'Course not found'));
    }

    if (req.user?.role !== 'ADMIN' && course.instructorId !== req.user?.id) {
      return next(new ErrorHandler(403, 'You do not have permission to modify this course'));
    }

    req.course = course;
    next();
  }
);
