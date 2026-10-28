import { Request, Response, NextFunction } from 'express';
import { catchAsyncError } from '../middleware/catchAsyncError';
import ErrorHandler from '../utils/ErrorHandler';
import { getCourseForCatalogue, getEnrollment } from '../services/course.service';
import { toMinorUnits } from '../utils/money';

// Catalogue lookup for order-service: everything an order snapshots at purchase time.
export const getCatalogueCourse = catchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const course = await getCourseForCatalogue(req.params.courseId);
    if (!course) return next(new ErrorHandler(404, 'Course not found'));

    return res.status(200).json({
      success: true,
      course: { ...course, amountMinor: toMinorUnits(course.price) },
    });
  }
);

// Entitlement check for order-service: stops a user buying a course they already own.
export const getCatalogueEnrollment = catchAsyncError(
  async (req: Request, res: Response) => {
    const { userId, courseId } = req.params;
    const enrollment = await getEnrollment(userId, courseId);

    return res.status(200).json({
      success: true,
      enrolled: Boolean(enrollment && !enrollment.revokedAt),
      enrollment: enrollment ?? null,
    });
  }
);
