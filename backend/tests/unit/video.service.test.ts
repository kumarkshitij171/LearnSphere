jest.mock('../../services/kafka.service', () => ({
  publishVideoUploaded: jest.fn().mockResolvedValue(undefined),
}));

import { PrismaClient } from '@prisma/client';
import { createVideoRecord, markVideoProcessed, getVideoById } from '../../services/video.service';
import { publishVideoUploaded } from '../../services/kafka.service';

const prisma: any = new PrismaClient();

const input = {
  videoId: 'vid-1',
  userId: 'user-1',
  courseId: 'course-1',
  originalKey: 'vid-1/original.mp4',
  title: 'Intro',
  mimeType: 'video/mp4',
};

describe('createVideoRecord', () => {
  it('creates an UPLOADED video and publishes video.uploaded', async () => {
    prisma.video.create.mockResolvedValue({ id: 'vid-1' });

    await createVideoRecord(input);

    const createArg = prisma.video.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('UPLOADED');
    expect(createArg.data.id).toBe('vid-1');
    expect(createArg.data.courseId).toBe('course-1');

    expect(publishVideoUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'vid-1',
        bucket: 'raw-video',
        key: 'vid-1/original.mp4',
        inputS3Path: 's3://raw-video/vid-1/original.mp4',
      })
    );
  });
});

describe('markVideoProcessed', () => {
  it('updates status + hlsMasterPath for an existing video', async () => {
    prisma.video.findUnique.mockResolvedValue({ id: 'vid-1' });
    prisma.video.update.mockResolvedValue({});

    await markVideoProcessed({ videoId: 'vid-1', status: 'READY', hlsMasterPath: 'vid-1/master.m3u8' });

    const updateArg = prisma.video.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('READY');
    expect(updateArg.data.hlsMasterPath).toBe('vid-1/master.m3u8');
  });

  it('throws when the video does not exist', async () => {
    prisma.video.findUnique.mockResolvedValue(null);
    await expect(markVideoProcessed({ videoId: 'missing', status: 'READY' })).rejects.toThrow('Video not found');
  });
});

describe('getVideoById', () => {
  it('looks up the video with its owner', async () => {
    prisma.video.findUnique.mockResolvedValue({ id: 'vid-1' });
    const res = await getVideoById('vid-1');
    expect(res).toEqual({ id: 'vid-1' });
    expect(prisma.video.findUnique.mock.calls[0][0].where).toEqual({ id: 'vid-1' });
  });
});
