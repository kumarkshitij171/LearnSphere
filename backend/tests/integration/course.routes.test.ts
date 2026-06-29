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
  it('enrolls a student (200)', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.enrollment.upsert.mockResolvedValue({ id: 'e1' });
    const res = await request(app)
      .post('/api/v1/courses/c1/enroll')
      .set('Cookie', cookie('STUDENT'));
    expect(res.status).toBe(200);
  });
});

describe('GET /courses/:id (video gating)', () => {
  const courseWithVideo = {
    id: 'c1',
    title: 'C',
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
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1' });
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
