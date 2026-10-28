import { PrismaClient } from '@prisma/client';
import { mockClient } from 'aws-sdk-client-mock';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
  createCourse,
  enrollInCourse,
  isEnrolled,
  grantFromOrder,
  revokeFromOrder,
  listPublishedCourses,
  listMyCourses,
  listAllCourses,
  listEnrolledCourses,
  deleteCourse,
} from '../../services/course.service';

const prisma: any = new PrismaClient();

describe('createCourse', () => {
  it('creates a course owned by the instructor with sane defaults', async () => {
    prisma.course.create.mockResolvedValue({ id: 'c1' });
    await createCourse('inst-1', { title: 'A', description: 'desc here' });
    const arg = prisma.course.create.mock.calls[0][0];
    expect(arg.data.instructorId).toBe('inst-1');
    expect(arg.data.price).toBe(0);
    // a thumbnail is only ever set through its upload endpoints
    expect(arg.data).not.toHaveProperty('thumbnail');
  });
});

describe('enrollInCourse', () => {
  it('upserts an enrollment when the course exists (idempotent)', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1', userId: 'u1', courseId: 'c1' });
    const res = await enrollInCourse('u1', 'c1');
    expect(res.ok).toBe(true);
    const arg = prisma.enrollment.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_courseId: { userId: 'u1', courseId: 'c1' } });
  });

  it('returns not-found when the course is missing', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    const res = await enrollInCourse('u1', 'missing');
    expect(res.ok).toBe(false);
  });
});

describe('isEnrolled', () => {
  it('reflects whether an enrollment row exists', async () => {
    prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 'e1', revokedAt: null });
    expect(await isEnrolled('u1', 'c1')).toBe(true);
    prisma.enrollment.findUnique.mockResolvedValueOnce(null);
    expect(await isEnrolled('u1', 'c2')).toBe(false);
  });

  it('treats a revoked (refunded) enrollment as not enrolled', async () => {
    prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 'e1', revokedAt: new Date() });
    expect(await isEnrolled('u1', 'c1')).toBe(false);
  });
});

describe('enrollInCourse re-grant', () => {
  it('clears a revocation and records provenance on an existing row', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
    await enrollInCourse('u1', 'c1', { source: 'PURCHASE', orderId: 'o2' } as any);
    const arg = prisma.enrollment.upsert.mock.calls[0][0];
    expect(arg.update).toEqual({ revokedAt: null, source: 'PURCHASE', orderId: 'o2' });
    expect(arg.create).toEqual({ userId: 'u1', courseId: 'c1', source: 'PURCHASE', orderId: 'o2' });
  });
});

describe('grantFromOrder', () => {
  it('creates a PURCHASE enrollment for a first purchase', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);
    prisma.course.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
    const res = await grantFromOrder('u1', 'c1', 'o1');
    expect(res.ok).toBe(true);
    expect(prisma.enrollment.upsert.mock.calls[0][0].create).toMatchObject({ source: 'PURCHASE', orderId: 'o1' });
  });

  it('is idempotent for an already active enrollment (redelivered order.paid)', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: 'o1', revokedAt: null });
    const res = await grantFromOrder('u1', 'c1', 'o1');
    expect(res.ok).toBe(true);
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it('does not resurrect access revoked for the same order', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: 'o1', revokedAt: new Date() });
    const res = await grantFromOrder('u1', 'c1', 'o1');
    expect(res.ok).toBe(false);
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it('re-grants when a refunded buyer pays with a new order', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: 'o1', revokedAt: new Date() });
    prisma.course.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
    const res = await grantFromOrder('u1', 'c1', 'o2');
    expect(res.ok).toBe(true);
    expect(prisma.enrollment.upsert.mock.calls[0][0].update).toMatchObject({ revokedAt: null, orderId: 'o2' });
  });
});

describe('revokeFromOrder', () => {
  it('revokes the enrollment that order granted', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: 'o1', revokedAt: null });
    prisma.enrollment.update.mockResolvedValue({ id: 'e1' });
    const res = await revokeFromOrder('u1', 'c1', 'o1');
    expect(res.ok).toBe(true);
    expect(prisma.enrollment.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('leaves an admin grant or a different purchase alone', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: null, revokedAt: null });
    expect((await revokeFromOrder('u1', 'c1', 'o1')).ok).toBe(false);
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', orderId: 'o2', revokedAt: null });
    expect((await revokeFromOrder('u1', 'c1', 'o1')).ok).toBe(false);
    expect(prisma.enrollment.update).not.toHaveBeenCalled();
  });
});

describe('catalogue counts', () => {
  it('lists only published courses with something ready to watch, counting ready lessons', async () => {
    prisma.course.findMany.mockResolvedValue([]);
    await listPublishedCourses();
    const args = prisma.course.findMany.mock.calls[prisma.course.findMany.mock.calls.length - 1][0];
    expect(args.where).toEqual({ isPublished: true, videos: { some: { status: 'READY' } } });
    expect(args.include._count.select.videos).toEqual({ where: { status: 'READY' } });
  });

  it("counts an instructor's active students, not refunded ones", async () => {
    prisma.course.findMany.mockResolvedValue([]);
    await listMyCourses('u1');
    const args = prisma.course.findMany.mock.calls[prisma.course.findMany.mock.calls.length - 1][0];
    expect(args.include._count.select.enrollments).toEqual({ where: { revokedAt: null } });
  });
});

describe('coverVideoId on course lists', () => {
  const lastFindManyArgs = () =>
    prisma.course.findMany.mock.calls[prisma.course.findMany.mock.calls.length - 1][0];

  it.each([
    ['listPublishedCourses', () => listPublishedCourses()],
    ['listAllCourses', () => listAllCourses()],
    ['listMyCourses', () => listMyCourses('u1')],
    ['listEnrolledCourses', () => listEnrolledCourses('u1')],
  ])('%s exposes the first ready lesson as coverVideoId instead of a videos array', async (_name, list) => {
    prisma.course.findMany.mockResolvedValue([
      { id: 'c1', title: 'Has a lesson', videos: [{ id: 'v1' }] },
      { id: 'c2', title: 'Nothing ready', videos: [] },
    ]);
    const courses = await list();
    expect(courses).toEqual([
      { id: 'c1', title: 'Has a lesson', coverVideoId: 'v1' },
      { id: 'c2', title: 'Nothing ready', coverVideoId: null },
    ]);
    expect(lastFindManyArgs().include.videos).toEqual({
      where: { status: 'READY' },
      orderBy: { createdAt: 'asc' },
      take: 1,
      select: { id: true },
    });
  });

  it('keeps the existing filters and counts alongside the cover lookup', async () => {
    prisma.course.findMany.mockResolvedValue([]);
    await listEnrolledCourses('u1');
    const args = lastFindManyArgs();
    expect(args.where).toEqual({ enrollments: { some: { userId: 'u1', revokedAt: null } } });
    expect(args.include._count.select.videos).toEqual({ where: { status: 'READY' } });
  });
});

describe('deleteCourse', () => {
  const s3 = mockClient(S3Client);
  const courseKey = 'course-thumbnails/c1/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.png';
  const lessonKey = 'lesson-thumbnails/v1/1c6f8b3d-2e3a-4d4c-8b9f-23456789abcd.jpg';

  beforeEach(() => {
    s3.reset();
    s3.on(ListObjectsV2Command).resolves({ Contents: [] });
    s3.on(DeleteObjectCommand).resolves({});
    prisma.$transaction.mockResolvedValue([]);
  });
  afterAll(() => s3.restore());

  it('removes the course and lesson thumbnails along with the videos', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', thumbnail: courseKey });
    prisma.video.findMany.mockResolvedValue([{ id: 'v1', originalKey: 'v1/original.mp4', thumbnail: lessonKey }]);
    await deleteCourse('c1');
    const deleted = s3.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input);
    expect(deleted).toEqual(
      expect.arrayContaining([
        { Bucket: 'course-assets', Key: courseKey },
        { Bucket: 'course-assets', Key: lessonKey },
        { Bucket: 'raw-video', Key: 'v1/original.mp4' },
      ])
    );
  });

  it('still deletes the course when a thumbnail cannot be removed', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', thumbnail: courseKey });
    prisma.video.findMany.mockResolvedValue([]);
    s3.on(DeleteObjectCommand).rejects(new Error('S3 down'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(deleteCourse('c1')).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
