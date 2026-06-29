import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/url'),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  generatePresignedUploadURL,
  generatePresignedUploadURLForVideo,
  generatePresignedDownloadURL,
} from '../../services/s3.service';

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(HeadBucketCommand).resolves({});
  (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/url');
});

const lastSignedCommand = () => (getSignedUrl as jest.Mock).mock.calls.at(-1)![1];

describe('generatePresignedUploadURLForVideo', () => {
  it('uses the {videoId}/original.mp4 key under the raw bucket', async () => {
    const res = await generatePresignedUploadURLForVideo('vid-1', 'video/mp4');
    expect(res).toEqual({ url: 'https://signed.example/url', key: 'vid-1/original.mp4', videoId: 'vid-1' });
    const cmd = lastSignedCommand();
    expect(cmd.input.Bucket).toBe('raw-video');
    expect(cmd.input.Key).toBe('vid-1/original.mp4');
    expect(cmd.input.ContentType).toBe('video/mp4');
  });
});

describe('generatePresignedUploadURL', () => {
  it('builds an uploads/{userId}/{uuid}-{file} key', async () => {
    const res = await generatePresignedUploadURL('movie.mp4', 'video/mp4', 'user-1');
    expect(res.url).toBe('https://signed.example/url');
    expect(res.key).toMatch(/^uploads\/user-1\/[0-9a-f-]+-movie\.mp4$/);
  });
});

describe('generatePresignedDownloadURL', () => {
  it('signs a GetObject for the given key/bucket', async () => {
    const url = await generatePresignedDownloadURL('vid-1/original.mp4', 'processed-video');
    expect(url).toBe('https://signed.example/url');
    expect(lastSignedCommand().input.Bucket).toBe('processed-video');
  });

  it('throws when no bucket is given', async () => {
    await expect(generatePresignedDownloadURL('k', '')).rejects.toThrow();
  });
});
