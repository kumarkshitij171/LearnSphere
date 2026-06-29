import { PrismaClient, Prisma } from '@prisma/client';
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

export const listPublishedCourses = () =>
  prisma.course.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'desc' },
    include: { instructor: { select: instructorSelect }, _count: { select: { videos: true } } },
  });

export const listMyCourses = (instructorId: string) =>
  prisma.course.findMany({
    where: { instructorId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { videos: true, enrollments: true } } },
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

export const enrollInCourse = async (userId: string, courseId: string) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { ok: false as const, reason: 'NOT_FOUND' as const };

  // Idempotent: upsert on the (userId, courseId) unique constraint.
  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId },
  });
  return { ok: true as const, enrollment };
};

export const isEnrolled = async (userId: string, courseId: string) => {
  const found = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  return !!found;
};
