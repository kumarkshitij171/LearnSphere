jest.mock('../../services/kafka.service', () => ({
  publishVideoUploaded: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';
import { generateAccessToken } from '../../services/user.service';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const cookie = (role: string, id = 'u1') =>
  `access_token=${generateAccessToken({ id, email: `${id}@x.com`, role } as any)}`;

const confirmBody = {
  videoId: 'vid-1',
  courseId: 'c1',
  title: 'Lesson 1',
  mimeType: 'video/mp4',
  originalKey: 'vid-1/original.mp4',
};

describe('POST /video-upload (confirm)', () => {
  it('rejects a student with 403', async () => {
    const res = await request(app).post('/api/v1/video-upload').set('Cookie', cookie('STUDENT')).send(confirmBody);
    expect(res.status).toBe(403);
  });

  it('rejects an instructor who does not own the course with 403', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'someone-else' });
    const res = await request(app).post('/api/v1/video-upload').set('Cookie', cookie('INSTRUCTOR', 'u1')).send(confirmBody);
    expect(res.status).toBe(403);
  });

  it('creates the video for the owning instructor (201) with courseId persisted', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'u1' });
    prisma.video.create.mockResolvedValue({ id: 'vid-1', status: 'UPLOADED', title: 'Lesson 1', originalKey: 'vid-1/original.mp4' });

    const res = await request(app).post('/api/v1/video-upload').set('Cookie', cookie('INSTRUCTOR', 'u1')).send(confirmBody);

    expect(res.status).toBe(201);
    expect(prisma.video.create.mock.calls[0][0].data.courseId).toBe('c1');
  });
});

describe('GET /video-upload/:videoId (enrollment gating)', () => {
  const video = { id: 'vid-1', userId: 'owner', courseId: 'c1', title: 'L', status: 'READY' };

  it('403s a non-enrolled, non-owner viewer', async () => {
    prisma.video.findUnique.mockResolvedValue(video);
    prisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/video-upload/vid-1').set('Cookie', cookie('STUDENT', 'viewer'));
    expect(res.status).toBe(403);
  });

  it('returns the video to an enrolled viewer', async () => {
    prisma.video.findUnique.mockResolvedValue(video);
    prisma.enrollment.findUnique.mockResolvedValue({ id: 'e1' });
    const res = await request(app).get('/api/v1/video-upload/vid-1').set('Cookie', cookie('STUDENT', 'viewer'));
    expect(res.status).toBe(200);
    expect(res.body.video.id).toBe('vid-1');
  });

  it('returns the video to its owner', async () => {
    prisma.video.findUnique.mockResolvedValue(video);
    const res = await request(app).get('/api/v1/video-upload/vid-1').set('Cookie', cookie('INSTRUCTOR', 'owner'));
    expect(res.status).toBe(200);
  });
});
