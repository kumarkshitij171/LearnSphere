import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';
import { generateAccessToken } from '../../services/user.service';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const token = (role: string, id = 'u1') =>
  generateAccessToken({ id, email: `${id}@x.com`, role } as any);

const cookie = (role: string, id?: string) => `access_token=${token(role, id)}`;

describe('POST /courses', () => {
  it('rejects a student with 403', async () => {
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Cookie', cookie('STUDENT'))
      .send({ title: 'My Course', description: 'A long enough description.' });
    expect(res.status).toBe(403);
  });

  it('lets an instructor create a course (201)', async () => {
    prisma.course.create.mockResolvedValue({ id: 'c1', title: 'My Course' });
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Cookie', cookie('INSTRUCTOR'))
      .send({ title: 'My Course', description: 'A long enough description.' });
    expect(res.status).toBe(201);
    expect(res.body.course.id).toBe('c1');
    expect(prisma.course.create.mock.calls[0][0].data.instructorId).toBe('u1');
  });
});

describe('POST /courses/:id/enroll', () => {
  it('sends a student to checkout with 402 { requiresOrder }', async () => {
    const res = await request(app)
      .post('/api/v1/courses/c1/enroll')
      .set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ success: false, requiresOrder: true, courseId: 'c1' });
    expect(prisma.enrollment.upsert).not.toHaveBeenCalled();
  });

  it('lets the course instructor grant access to a user (INSTRUCTOR source)', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'u1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
    const res = await request(app)
      .post('/api/v1/courses/c1/enroll')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ userId: 'student-9' });
    expect(res.status).toBe(200);
    const arg = prisma.enrollment.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ userId: 'student-9', courseId: 'c1', source: 'INSTRUCTOR' });
  });

  it("refuses an instructor granting on someone else's course", async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'other' });
    const res = await request(app)
      .post('/api/v1/courses/c1/enroll')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ userId: 'student-9' });
    expect(res.status).toBe(403);
  });

  it('requires a userId to grant', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'u1' });
    const res = await request(app)
      .post('/api/v1/courses/c1/enroll')
      .set('Cookie', cookie('ADMIN', 'a1'));
    expect(res.status).toBe(400);
  });
});

describe('GET /courses/enrolled', () => {
  it("lists the student's active enrollments", async () => {
    prisma.course.findMany.mockResolvedValue([{ id: 'c1' }]);
    const res = await request(app).get('/api/v1/courses/enrolled').set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(200);
    expect(res.body.courses).toEqual([{ id: 'c1' }]);
    expect(prisma.course.findMany.mock.calls[0][0].where).toEqual({
      enrollments: { some: { userId: 'u1', revokedAt: null } },
    });
  });
});

describe('GET /courses/:id (video gating)', () => {
  const courseWithVideo = {
    id: 'c1',
    title: 'C',
    isPublished: true,
    instructorId: 'other',
    instructor: { id: 'other', name: 'O', email: 'o@x.com' },
    videos: [{ id: 'v1', title: 'L1', status: 'READY' }],
  };

  it('hides videos from a non-enrolled student', async () => {
    prisma.course.findUnique.mockResolvedValue(courseWithVideo);
    prisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(200);
    expect(res.body.course.canAccessVideos).toBe(false);
    expect(res.body.course.videos).toEqual([]);
  });

  it('shows videos to an enrolled student', async () => {
    prisma.course.findUnique.mockResolvedValue(courseWithVideo);
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1', revokedAt: null });
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(200);
    expect(res.body.course.canAccessVideos).toBe(true);
    expect(res.body.course.videos).toHaveLength(1);
  });

  it('shows videos to the owner without enrollment', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...courseWithVideo, instructorId: 'u1' });
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(200);
    expect(res.body.course.canAccessVideos).toBe(true);
  });
});

describe('course price rules', () => {
  const create = (price: unknown) =>
    request(app)
      .post('/api/v1/courses')
      .set('Cookie', cookie('INSTRUCTOR'))
      .send({ title: 'Priced course', description: 'A long enough description.', price });

  beforeEach(() => prisma.course.create.mockResolvedValue({ id: 'c1' }));

  it.each([0, 1, 19.99, 499, 500000])('accepts %p', async (price) => {
    expect((await create(price)).status).toBe(201);
  });

  it('refuses a paid price below the gateway minimum', async () => {
    const res = await create(0.5);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 1/);
  });

  it.each([
    [-1, /negative/],
    [500001, /more than/],
    [10.123, /two decimal/],
  ])('refuses %p', async (price, message) => {
    const res = await create(price);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });
});

describe('PATCH /courses/:id publish guard', () => {
  const owned = { id: 'c1', instructorId: 'u1', isPublished: false };

  it('refuses to publish a course with no ready lesson (409)', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    prisma.video.count.mockResolvedValue(0);
    const res = await request(app)
      .patch('/api/v1/courses/c1')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ isPublished: true });
    expect(res.status).toBe(409);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('publishes once a lesson is ready', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    prisma.video.count.mockResolvedValue(2);
    prisma.course.update.mockResolvedValue({ ...owned, isPublished: true });
    const res = await request(app)
      .patch('/api/v1/courses/c1')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ isPublished: true });
    expect(res.status).toBe(200);
  });

  it('never blocks unpublishing or other edits', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...owned, isPublished: true });
    prisma.course.update.mockResolvedValue({ ...owned });
    const res = await request(app)
      .patch('/api/v1/courses/c1')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ isPublished: false });
    expect(res.status).toBe(200);
    expect(prisma.video.count).not.toHaveBeenCalled();
  });
});

describe('GET /courses/:id curriculum and drafts', () => {
  const base = {
    id: 'c1',
    title: 'C',
    instructorId: 'other',
    isPublished: true,
    instructor: { id: 'other', name: 'O', email: 'o@x.com' },
    videos: [
      { id: 'v1', title: 'Intro', status: 'READY', duration: 120, hlsMasterPath: 'v1/master.m3u8' },
      { id: 'v2', title: 'Broken', status: 'FAILED', duration: null },
    ],
  };

  it('shows a non-buyer the ready curriculum without ids or stream paths', async () => {
    prisma.course.findUnique.mockResolvedValue(base);
    prisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(200);
    expect(res.body.course.curriculum).toEqual([{ title: 'Intro', duration: 120 }]);
    expect(JSON.stringify(res.body)).not.toContain('master.m3u8');
    expect(JSON.stringify(res.body.course.curriculum)).not.toContain('v1');
  });

  it('hides a draft from students who do not have it', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...base, isPublished: false });
    prisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(404);
  });

  it('still shows a draft to its instructor', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...base, isPublished: false, instructorId: 'u1' });
    const res = await request(app).get('/api/v1/courses/c1').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(200);
  });
});
