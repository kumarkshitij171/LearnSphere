jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://storage.example/signed'),
}));

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { mockClient } from 'aws-sdk-client-mock';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
    expect(res.body.courses).toEqual([{ id: 'c1', coverVideoId: null }]);
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

describe('course thumbnail', () => {
  const s3 = mockClient(S3Client);
  const key = 'course-thumbnails/c1/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.png';
  const previous = 'course-thumbnails/c1/1c6f8b3d-2e3a-4d4c-8b9f-23456789abcd.jpg';
  const owned = { id: 'c1', instructorId: 'u1', thumbnail: previous };
  const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  const deletedKeys = () => s3.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input.Key);

  beforeEach(() => {
    s3.reset();
    s3.on(DeleteObjectCommand).resolves({});
    prisma.course.update.mockResolvedValue({});
  });
  afterAll(() => s3.restore());

  const presign = (contentType: unknown, id = 'u1') =>
    request(app)
      .post('/api/v1/courses/c1/thumbnail/presign')
      .set('Cookie', cookie('INSTRUCTOR', id))
      .send({ contentType });
  const confirm = (body: object, id = 'u1') =>
    request(app).put('/api/v1/courses/c1/thumbnail').set('Cookie', cookie('INSTRUCTOR', id)).send(body);

  it('presigns an upload under the course folder for its owner', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    const res = await presign('image/png');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      uploadUrl: 'https://storage.example/signed',
      key: expect.stringMatching(/^course-thumbnails\/c1\/[0-9a-f-]{36}\.png$/),
    });
  });

  it.each(['image/gif', 'image/svg+xml', undefined])('refuses to presign %p', async (contentType) => {
    prisma.course.findUnique.mockResolvedValue(owned);
    const res = await presign(contentType);
    expect(res.status).toBe(400);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("refuses someone else's course with 403", async () => {
    prisma.course.findUnique.mockResolvedValue({ ...owned, instructorId: 'other' });
    expect((await presign('image/png')).status).toBe(403);
    expect((await confirm({ key })).status).toBe(403);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('saves a good upload and deletes the image it replaces', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    s3.on(HeadObjectCommand).resolves({ ContentLength: 120_000, ContentType: 'image/png' });
    const res = await confirm({ key });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, thumbnail: key });
    expect(prisma.course.update.mock.calls[0][0]).toEqual({ where: { id: 'c1' }, data: { thumbnail: key } });
    expect(deletedKeys()).toEqual([previous]);
  });

  it('refuses a key outside this course without deleting it', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    const res = await confirm({ key: 'course-thumbnails/c2/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.png' });
    expect(res.status).toBe(400);
    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(deletedKeys()).toEqual([]);
  });

  it('refuses an upload that never arrived', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    s3.on(HeadObjectCommand).rejects(notFound);
    expect((await confirm({ key })).status).toBe(400);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it.each([
    ['too big', { ContentLength: 5 * 1024 * 1024 + 1, ContentType: 'image/png' }],
    ['the wrong type', { ContentLength: 1000, ContentType: 'text/html' }],
  ])('refuses and deletes an upload that is %s', async (_why, head) => {
    prisma.course.findUnique.mockResolvedValue(owned);
    s3.on(HeadObjectCommand).resolves(head);
    expect((await confirm({ key })).status).toBe(400);
    expect(prisma.course.update).not.toHaveBeenCalled();
    expect(deletedKeys()).toEqual([key]);
  });

  it('removes the thumbnail', async () => {
    prisma.course.findUnique.mockResolvedValue(owned);
    const res = await request(app).delete('/api/v1/courses/c1/thumbnail').set('Cookie', cookie('INSTRUCTOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(prisma.course.update.mock.calls[0][0].data).toEqual({ thumbnail: null });
    expect(deletedKeys()).toEqual([previous]);
  });

  it('serves the image publicly as a short-cached redirect to a signed URL', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', thumbnail: key });
    const res = await request(app).get('/api/v1/courses/c1/thumbnail');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://storage.example/signed');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect((getSignedUrl as jest.Mock).mock.calls[0][1].input).toEqual({ Bucket: 'course-assets', Key: key });
  });

  it.each([null, 'https://example.com/cover.png'])('answers 404 when the thumbnail is %p', async (thumbnail) => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', thumbnail });
    const res = await request(app).get('/api/v1/courses/c1/thumbnail');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('answers 404 for an unknown course', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    expect((await request(app).get('/api/v1/courses/nope/thumbnail')).status).toBe(404);
  });
});
