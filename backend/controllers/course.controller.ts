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
  listEnrolledCourses,
  countReadyVideos,
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
  // a draft does not exist for anyone but its instructor, admins and students who already have it
  if (!course.isPublished && !canAccessVideos) return next(new ErrorHandler(404, 'Course not found'));

  // Only surface playable videos to owner/admin/enrolled users. Everyone gets the curriculum —
  // titles and lengths of the ready lessons, without ids, since an id is enough to build a stream URL.
  const { videos, ...meta } = course as any;
  const curriculum = (videos as Array<{ title: string; duration: number | null; status: string }>)
    .filter((v) => v.status === 'READY')
    .map((v) => ({ title: v.title, duration: v.duration ?? null }));
  return res.status(200).json({
    success: true,
    course: { ...meta, enrolled, canAccessVideos, curriculum, videos: canAccessVideos ? videos : [] },
  });
});

export const updateCourse = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  // req.course is set by requireCourseOwner
  if (req.body.isPublished === true && !req.course!.isPublished) {
    // a hidden Publish button is not a rule: a buyer must never be able to pay for an empty course
    const ready = await countReadyVideos(req.course!.id);
    if (ready === 0) {
      return next(new ErrorHandler(409, 'Add at least one ready lesson before publishing this course'));
    }
  }
  const course = await updateCourseService(req.course!.id, req.body);
  return res.status(200).json({ success: true, course });
});

export const deleteCourse = catchAsyncError(async (req: Request, res: Response) => {
  await deleteCourseService(req.course!.id);
  return res.status(200).json({ success: true, message: 'Course deleted' });
});

export const listEnrolled = catchAsyncError(async (req: Request, res: Response) => {
  const courses = await listEnrolledCourses(req.user!.id);
  return res.status(200).json({ success: true, courses });
});

// Students buy through order-service (free courses included), so they get a hint to redirect.
export const rejectStudentEnroll = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  if (req.user!.role === 'STUDENT') {
    return next(new ErrorHandler(402, 'Enrolment goes through checkout', {
      requiresOrder: true,
      courseId: req.params.courseId,
    }));
  }
  next();
});

// Grant: the course's instructor or an admin enrols a named user (requireCourseOwner runs first).
export const grantEnrollment = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.body?.userId;
  if (!userId || typeof userId !== 'string') {
    return next(new ErrorHandler(400, 'userId is required'));
  }
  const source = req.user!.role === 'ADMIN' ? 'ADMIN_GRANT' : 'INSTRUCTOR';
  const result = await enrollInCourse(userId, req.params.courseId, { source });
  if (!result.ok) return next(new ErrorHandler(404, 'Course not found'));
  return res.status(200).json({ success: true, enrollment: result.enrollment });
});
