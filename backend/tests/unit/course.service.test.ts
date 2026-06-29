import { PrismaClient } from '@prisma/client';
import { createCourse, enrollInCourse, isEnrolled } from '../../services/course.service';

const prisma: any = new PrismaClient();

describe('createCourse', () => {
  it('creates a course owned by the instructor with sane defaults', async () => {
    prisma.course.create.mockResolvedValue({ id: 'c1' });
    await createCourse('inst-1', { title: 'A', description: 'desc here' });
    const arg = prisma.course.create.mock.calls[0][0];
    expect(arg.data.instructorId).toBe('inst-1');
    expect(arg.data.price).toBe(0);
    expect(arg.data.thumbnail).toBeNull();
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
    prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 'e1' });
    expect(await isEnrolled('u1', 'c1')).toBe(true);
    prisma.enrollment.findUnique.mockResolvedValueOnce(null);
    expect(await isEnrolled('u1', 'c2')).toBe(false);
  });
});
