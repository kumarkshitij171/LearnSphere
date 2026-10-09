import { PrismaClient, Prisma, EnrollmentSource } from '@prisma/client';
import { deleteVideoS3Artifacts } from './s3.service';

const prisma = new PrismaClient();

const instructorSelect = { id: true, name: true, email: true };

export interface CreateCourseInput {
  title: string;
  description: string;
  price?: number;
  thumbnail?: string;
}

export const createCourse = (instructorId: string, input: CreateCourseInput) =>
  prisma.course.create({
    data: {
      title: input.title,
      description: input.description,
      price: input.price ?? 0,
      thumbnail: input.thumbnail ?? null,
      instructorId,
    },
  });

// What a student counts as "lessons" is what they can watch: processing and failed videos are not.
const readyLessonCount = { videos: { where: { status: 'READY' as const } } };

// A published course with nothing ready to watch (every lesson deleted or failed) stays out of the
// catalogue rather than being sold empty.
export const listPublishedCourses = () =>
  prisma.course.findMany({
    where: { isPublished: true, videos: { some: { status: 'READY' } } },
    orderBy: { createdAt: 'desc' },
    include: { instructor: { select: instructorSelect }, _count: { select: readyLessonCount } },
  });

/** Every course, drafts included, for the admin console — with who made it and how it is doing. */
export const listAllCourses = () =>
  prisma.course.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      instructor: { select: instructorSelect },
      _count: { select: { videos: true, enrollments: { where: { revokedAt: null } } } },
    },
  });

export const listMyCourses = (instructorId: string) =>
  prisma.course.findMany({
    where: { instructorId },
    orderBy: { createdAt: 'desc' },
    // the instructor sees every lesson they made; students counted are the ones with access today
    include: { _count: { select: { videos: true, enrollments: { where: { revokedAt: null } } } } },
  });

export const getCourseById = (courseId: string, opts: { withVideos?: boolean } = {}) =>
  prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: { select: instructorSelect },
      videos: opts.withVideos
        ? { orderBy: { createdAt: 'asc' } }
        : false,
    },
  });

export const countReadyVideos = (courseId: string) =>
  prisma.video.count({ where: { courseId, status: 'READY' } });

// Lean projection for order-service: only the fields an order snapshots.
export const getCourseForCatalogue = (courseId: string) =>
  prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      isPublished: true,
      instructorId: true,
    },
  });

// Entitlement lookup for order-service. A revoked row is kept for history but
// must read as "not enrolled", so a refunded buyer can purchase again.
export const getEnrollment = (userId: string, courseId: string) =>
  prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true, orderId: true, source: true, enrolledAt: true, revokedAt: true },
  });

export const updateCourse = (courseId: string, data: Prisma.CourseUpdateInput) =>
  prisma.course.update({ where: { id: courseId }, data });

// Cascade: drop the course's videos (+ transcode jobs) and enrollments, then
// best-effort clean up each video's S3 artifacts.
export const deleteCourse = async (courseId: string) => {
  const videos = await prisma.video.findMany({
    where: { courseId },
    select: { id: true, originalKey: true },
  });
  const videoIds = videos.map((v) => v.id);

  await prisma.$transaction([
    ...(videoIds.length
      ? [prisma.videoTranscodeJob.deleteMany({ where: { videoId: { in: videoIds } } })]
      : []),
    prisma.video.deleteMany({ where: { courseId } }),
    prisma.enrollment.deleteMany({ where: { courseId } }),
    prisma.course.delete({ where: { id: courseId } }),
  ]);

  await Promise.allSettled(videos.map((v) => deleteVideoS3Artifacts(v.originalKey, v.id)));
};

export interface EnrollOptions {
  source?: EnrollmentSource;
  orderId?: string;
}

// Idempotent: upsert on (userId, courseId). Re-granting clears a revocation, so a buyer refunded
// earlier who purchases again gets access back.
export const enrollInCourse = async (userId: string, courseId: string, opts: EnrollOptions = {}) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { ok: false as const, reason: 'NOT_FOUND' as const };

  const provenance = {
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.orderId ? { orderId: opts.orderId } : {}),
  };
  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { revokedAt: null, ...provenance },
    create: { userId, courseId, ...provenance },
  });
  return { ok: true as const, enrollment };
};

// Grant from a paid order. A redelivered order.paid for an order that was since refunded must
// not resurrect access, so a revocation made against the same order wins.
export const grantFromOrder = async (userId: string, courseId: string, orderId: string) => {
  const existing = await getEnrollment(userId, courseId);
  if (existing?.revokedAt && existing.orderId === orderId) {
    return { ok: false as const, reason: 'REVOKED_FOR_THIS_ORDER' as const };
  }
  if (existing && !existing.revokedAt) return { ok: true as const, enrollment: existing };
  return enrollInCourse(userId, courseId, { source: 'PURCHASE', orderId });
};

// Revoke only what this order granted: an admin grant or a later purchase is left alone.
export const revokeFromOrder = async (userId: string, courseId: string, orderId: string) => {
  const existing = await getEnrollment(userId, courseId);
  if (!existing || existing.orderId !== orderId || existing.revokedAt) {
    return { ok: false as const, reason: 'NOT_GRANTED_BY_ORDER' as const };
  }
  const enrollment = await prisma.enrollment.update({
    where: { userId_courseId: { userId, courseId } },
    data: { revokedAt: new Date() },
  });
  return { ok: true as const, enrollment };
};

// A revoked row is history, not access.
export const isEnrolled = async (userId: string, courseId: string) => {
  const found = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  return !!found && !found.revokedAt;
};

export const listEnrolledCourses = (userId: string) =>
  prisma.course.findMany({
    where: { enrollments: { some: { userId, revokedAt: null } } },
    orderBy: { createdAt: 'desc' },
    include: { instructor: { select: instructorSelect }, _count: { select: readyLessonCount } },
  });
