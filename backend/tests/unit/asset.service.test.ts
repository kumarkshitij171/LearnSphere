import { mockClient } from 'aws-sdk-client-mock';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/url'),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MAX_THUMBNAIL_BYTES,
  isThumbnailKeyFor,
  presignThumbnailDownload,
  presignThumbnailUpload,
  removeThumbnail,
  verifyThumbnailUpload,
} from '../../services/asset.service';

const s3Mock = mockClient(S3Client);
const key = 'course-thumbnails/c1/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.png';
const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
const lastSignedCommand = () => (getSignedUrl as jest.Mock).mock.calls.at(-1)![1];

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(DeleteObjectCommand).resolves({});
  (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/url');
});

describe('presignThumbnailUpload', () => {
  it('mints a fresh key under the owner folder, extension from the content type', async () => {
    const res = await presignThumbnailUpload('lesson', 'vid-1', 'image/webp');
    expect(res.uploadUrl).toBe('https://signed.example/url');
    expect(res.key).toMatch(/^lesson-thumbnails\/vid-1\/[0-9a-f-]{36}\.webp$/);
    expect(lastSignedCommand().input).toEqual({ Bucket: 'course-assets', Key: res.key, ContentType: 'image/webp' });
  });

  it('uses S3_ASSET_BUCKET when it is set', async () => {
    process.env.S3_ASSET_BUCKET = 'my-assets';
    try {
      await presignThumbnailUpload('course', 'c1', 'image/jpeg');
      expect(lastSignedCommand().input.Bucket).toBe('my-assets');
      expect(lastSignedCommand().input.Key).toMatch(/\.jpg$/);
    } finally {
      delete process.env.S3_ASSET_BUCKET;
    }
  });
});

describe('isThumbnailKeyFor', () => {
  it('accepts only a minted key for the same owner', () => {
    expect(isThumbnailKeyFor('course', 'c1', key)).toBe(true);
    expect(isThumbnailKeyFor('course', 'c2', key)).toBe(false);
    expect(isThumbnailKeyFor('lesson', 'c1', key)).toBe(false);
    expect(isThumbnailKeyFor('course', 'c1', 'course-thumbnails/c1/../c2/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.png')).toBe(false);
    expect(isThumbnailKeyFor('course', 'c1', 'course-thumbnails/c1/0b5e7a2c-1d2f-4c3b-9a8e-123456789abc.svg')).toBe(false);
    expect(isThumbnailKeyFor('course', 'c1', 'https://example.com/cover.png')).toBe(false);
    expect(isThumbnailKeyFor('course', 'c1', null)).toBe(false);
  });
});

describe('verifyThumbnailUpload', () => {
  it('accepts an image up to 5 MB', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: MAX_THUMBNAIL_BYTES, ContentType: 'image/png' });
    expect(await verifyThumbnailUpload('course', 'c1', key)).toBeNull();
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  it('refuses and deletes an upload that is too big', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: MAX_THUMBNAIL_BYTES + 1, ContentType: 'image/png' });
    expect(await verifyThumbnailUpload('course', 'c1', key)).toMatch(/5 MB/);
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({ Bucket: 'course-assets', Key: key });
  });

  it('refuses and deletes an upload of the wrong type', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 100, ContentType: 'image/svg+xml' });
    expect(await verifyThumbnailUpload('course', 'c1', key)).toMatch(/JPEG, PNG or WebP/);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
  });

  it('refuses a missing upload', async () => {
    s3Mock.on(HeadObjectCommand).rejects(notFound);
    expect(await verifyThumbnailUpload('course', 'c1', key)).toMatch(/not finished uploading/);
  });

  it("refuses another owner's key without touching it", async () => {
    expect(await verifyThumbnailUpload('course', 'c2', key)).toMatch(/does not belong/);
    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });
});

describe('presignThumbnailDownload', () => {
  it('signs a GET on the asset bucket for an hour', async () => {
    expect(await presignThumbnailDownload(key)).toBe('https://signed.example/url');
    expect(lastSignedCommand().input).toEqual({ Bucket: 'course-assets', Key: key });
    expect((getSignedUrl as jest.Mock).mock.calls.at(-1)![2]).toEqual({ expiresIn: 3600 });
  });
});

describe('removeThumbnail', () => {
  it('ignores keys it did not mint for that owner', async () => {
    await removeThumbnail('course', 'c1', 'https://example.com/cover.png');
    await removeThumbnail('course', 'c1', null);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  it('never throws when S3 refuses', async () => {
    s3Mock.on(DeleteObjectCommand).rejects(new Error('S3 down'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(removeThumbnail('course', 'c1', key)).resolves.toBeUndefined();
    quiet.mockRestore();
  });
});
