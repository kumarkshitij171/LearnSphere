import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import {
  createCourse as createCourseService,
  listPublishedCourses,
  listMyCourses,
  getCourseById,
  updateCourse as updateCourseService,
  deleteCourse as deleteCourseService,
  enrollInCourse,
  isEnrolled,
} from '../services/course.service';

export const createCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const course = await createCourseService(req.user!.id, req.body);
  return res.status(201).json({ success: true, course });
});

export const listCourses = catchAsyncError(async (_req: Request, res: Response) => {
  const courses = await listPublishedCourses();
  return res.status(200).json({ success: true, courses });
});

export const listMine = catchAsyncError(async (req: Request, res: Response) => {
  const courses = await listMyCourses(req.user!.id);
  return res.status(200).json({ success: true, courses });
});

export const getCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const { courseId } = req.params;
  const course = await getCourseById(courseId, { withVideos: true });
  if (!course) return next(new ErrorHandler(404, 'Course not found'));

  const userId = req.user!.id;
  const isOwner = course.instructorId === userId;
  const isAdmin = req.user!.role === 'ADMIN';
  const enrolled = isOwner || isAdmin ? true : await isEnrolled(userId, courseId);
  const canAccessVideos = isOwner || isAdmin || enrolled;

  // Only surface playable videos to owner/admin/enrolled users.
  const { videos, ...meta } = course as any;
  return res.status(200).json({
    success: true,
    course: { ...meta, enrolled, canAccessVideos, videos: canAccessVideos ? videos : [] },
  });
});

export const updateCourse = catchAsyncError(async (req: Request, res: Response) => {
  // req.course is set by requireCourseOwner
  const course = await updateCourseService(req.course!.id, req.body);
  return res.status(200).json({ success: true, course });
});

export const deleteCourse = catchAsyncError(async (req: Request, res: Response) => {
  await deleteCourseService(req.course!.id);
  return res.status(200).json({ success: true, message: 'Course deleted' });
});

export const enroll = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const result = await enrollInCourse(req.user!.id, req.params.courseId);
  if (!result.ok) return next(new ErrorHandler(404, 'Course not found'));
  return res.status(200).json({ success: true, enrollment: result.enrollment });
});
