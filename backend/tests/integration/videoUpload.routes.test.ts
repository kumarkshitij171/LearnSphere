jest.mock('../../services/kafka.service', () => ({
  publishVideoUploaded: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://storage.example/signed-upload'),
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

describe('POST /video-upload/:videoId/processed (transcoder callback)', () => {
  const url = '/api/v1/video-upload/vid-1/processed';
  const key = { 'X-Transcoder-Api-Key': 'test_transcoder_key' };
  const renditions = [
    { label: '1080p', width: 1920, height: 1080, bandwidth: 5_478_000 },
    { label: '720p', width: 1280, height: 720, bandwidth: 3_124_000 },
  ];

  beforeEach(() => {
    prisma.video.findUnique.mockResolvedValue({ id: 'vid-1', status: 'READY', hlsMasterPath: 'vid-1/master.m3u8' });
    prisma.video.update.mockResolvedValue({});
  });
  const written = () => prisma.video.update.mock.calls[0][0].data;

  it('rejects a call without the transcoder API key', async () => {
    const res = await request(app).post(url).send({ status: 'TRANSCODING' });
    expect(res.status).toBe(401);
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it('stores the duration and renditions sent with READY', async () => {
    const res = await request(app).post(url).set(key)
      .send({ status: 'READY', hlsMasterPath: 'vid-1/master.m3u8', duration: 62, resolutions: renditions });
    expect(res.status).toBe(200);
    expect(written()).toMatchObject({ status: 'READY', hlsMasterPath: 'vid-1/master.m3u8', duration: 62, resolutions: renditions });
  });

  it('stores the error code next to the error text on FAILED', async () => {
    const res = await request(app).post(url).set(key)
      .send({ status: 'FAILED', error: 'unsupported or corrupt video: moov atom not found', errorCode: 'CORRUPT_OR_UNSUPPORTED' });
    expect(res.status).toBe(200);
    expect(written().metadata).toEqual({ error: 'unsupported or corrupt video: moov atom not found', errorCode: 'CORRUPT_OR_UNSUPPORTED' });
  });

  it('accepts each of the four error codes', async () => {
    for (const errorCode of ['CORRUPT_OR_UNSUPPORTED', 'SOURCE_MISSING', 'GAVE_UP', 'UNKNOWN']) {
      prisma.video.update.mockClear();
      await request(app).post(url).set(key).send({ status: 'FAILED', error: 'x', errorCode }).expect(200);
      expect(written().metadata.errorCode).toBe(errorCode);
    }
  });

  it('ignores an unknown error code but keeps the error text', async () => {
    await request(app).post(url).set(key).send({ status: 'FAILED', error: 'boom', errorCode: 'DISK_ON_FIRE' }).expect(200);
    expect(written().metadata).toEqual({ error: 'boom' });
  });

  it('drops malformed metadata rather than losing the READY', async () => {
    const malformed = [
      { duration: -3, resolutions: [{ label: '720p', width: 1280 }] },
      { duration: '62', resolutions: 'all of them' },
      { duration: 61.6, resolutions: [{ label: '720p', width: '1280', height: 720, bandwidth: 1 }] },
    ];
    for (const extras of malformed) {
      prisma.video.update.mockClear();
      const res = await request(app).post(url).set(key).send({ status: 'READY', hlsMasterPath: 'vid-1/master.m3u8', ...extras });
      expect(res.status).toBe(200);
      expect(written().status).toBe('READY');
      expect(written()).not.toHaveProperty('duration');
      expect(written()).not.toHaveProperty('resolutions');
    }
  });

  it('keeps only the known fields of each rendition', async () => {
    await request(app).post(url).set(key)
      .send({ status: 'READY', hlsMasterPath: 'vid-1/master.m3u8', resolutions: [{ ...renditions[0], fps: 30 }] })
      .expect(200);
    expect(written().resolutions).toEqual([renditions[0]]);
  });

  it('answers 404 for a video that no longer exists, so the transcoder stops reporting', async () => {
    prisma.video.findUnique.mockResolvedValue(null);
    const res = await request(app).post(url).set(key).send({ status: 'READY', hlsMasterPath: 'vid-1/master.m3u8' });
    expect(res.status).toBe(404);
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it('still requires hlsMasterPath with READY', async () => {
    const res = await request(app).post(url).set(key).send({ status: 'READY', duration: 62 });
    expect(res.status).toBe(400);
  });
});

describe('replace and retry a lesson', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { mockClient } = require('aws-sdk-client-mock');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { publishVideoUploaded } = require('../../services/kafka.service');
  const s3 = mockClient(S3Client);
  const failed = { id: 'vid-1', userId: 'u1', status: 'FAILED', originalKey: 'vid-1/original.mp4', title: 'L', description: null };

  beforeEach(() => {
    s3.reset();
    s3.on(ListObjectsV2Command).resolves({ Contents: [] });
    process.env.S3_RAW_VIDEO_BUCKET = process.env.S3_RAW_VIDEO_BUCKET || 'raw-video';
    (publishVideoUploaded as jest.Mock).mockClear();
    prisma.video.update.mockImplementation(({ data }: any) => Promise.resolve({ ...failed, ...data }));
  });

  const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });

  it('retries a failed lesson from its original and republishes it', async () => {
    prisma.video.findUnique.mockResolvedValue(failed);
    s3.on(HeadObjectCommand).resolves({});
    const res = await request(app).post('/api/v1/video-upload/vid-1/retry').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(200);
    expect(res.body.video.status).toBe('UPLOADED');
    expect(prisma.video.update.mock.calls[0][0].data).toMatchObject({ status: 'UPLOADED', hlsMasterPath: null, duration: null });
    expect(publishVideoUploaded).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'vid-1', key: 'vid-1/original.mp4' }));
  });

  it('only retries failed lessons', async () => {
    prisma.video.findUnique.mockResolvedValue({ ...failed, status: 'READY' });
    const res = await request(app).post('/api/v1/video-upload/vid-1/retry').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(409);
    expect(publishVideoUploaded).not.toHaveBeenCalled();
  });

  it('asks for a replacement when the original is gone', async () => {
    prisma.video.findUnique.mockResolvedValue(failed);
    s3.on(HeadObjectCommand).rejects(notFound);
    const res = await request(app).post('/api/v1/video-upload/vid-1/retry').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/replace the video/);
  });

  it("refuses someone else's lesson", async () => {
    prisma.video.findUnique.mockResolvedValue({ ...failed, userId: 'other' });
    const res = await request(app).post('/api/v1/video-upload/vid-1/retry').set('Cookie', cookie('INSTRUCTOR', 'u1'));
    expect(res.status).toBe(403);
  });

  it('presigns a replacement for the same lesson', async () => {
    prisma.video.findUnique.mockResolvedValue(failed);
    const res = await request(app)
      .post('/api/v1/video-upload/vid-1/replace/presign')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ contentType: 'video/mp4' });
    expect(res.status).toBe(200);
    expect(res.body.videoId).toBe('vid-1');
    expect(res.body.key).toBe('vid-1/original.mp4');
  });

  it('confirms a replacement only once the new file is there', async () => {
    prisma.video.findUnique.mockResolvedValue(failed);
    s3.on(HeadObjectCommand).rejects(notFound);
    const early = await request(app)
      .post('/api/v1/video-upload/vid-1/replace')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ mimeType: 'video/mp4', fileName: 'new.mp4', fileSize: 10 });
    expect(early.status).toBe(409);

    s3.on(HeadObjectCommand).resolves({});
    const res = await request(app)
      .post('/api/v1/video-upload/vid-1/replace')
      .set('Cookie', cookie('INSTRUCTOR', 'u1'))
      .send({ mimeType: 'video/mp4', fileName: 'new.mp4', fileSize: 10 });
    expect(res.status).toBe(200);
    expect(prisma.video.update.mock.calls.at(-1)[0].data).toMatchObject({ mimeType: 'video/mp4', fileName: 'new.mp4', fileSize: 10, status: 'UPLOADED' });
    expect(publishVideoUploaded).toHaveBeenCalledTimes(1);
  });
});
