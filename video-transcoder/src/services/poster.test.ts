import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractPoster, posterTime } from './poster.js';
import { contentTypeFor } from './s3.service.js';
import { ffmpegPath, ffprobePath } from '../config/ffmpeg.js';

test('the poster is taken about 10% in, at least 1 s, and never past the end', () => {
  assert.equal(posterTime(60), 6);
  assert.equal(posterTime(3600), 360);
  assert.equal(posterTime(5), 1);
  assert.equal(posterTime(1), 0.5);
  assert.equal(posterTime(0.4), 0.2);
  assert.equal(posterTime(0), 0); // duration unknown: the first frame
});

test('the poster is uploaded as a JPEG', () => {
  assert.equal(contentTypeFor('v1/poster.jpg'), 'image/jpeg');
  assert.equal(contentTypeFor('v1/master.m3u8'), 'application/vnd.apple.mpegurl');
  assert.equal(contentTypeFor('v1/720p/segment_000.ts'), 'video/MP2T');
});

const dir = mkdtempSync(join(tmpdir(), 'poster-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const clip = (name: string, size: string, ...extra: string[]) => {
  const path = join(dir, name);
  execFileSync(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=2`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...extra, path]);
  return path;
};
const sizeOf = (jpg: string) =>
  execFileSync(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', jpg]).toString().trim();

test('a wide source gives a poster at most 1280 wide, aspect kept', async () => {
  const out = join(dir, 'wide.jpg');
  await extractPoster(clip('wide.mp4', '1920x1080'), out, 1);
  assert.equal(sizeOf(out), 'mjpeg,1280,720');
});

test('a rotated phone clip gives a portrait poster, and a small one is never upscaled', async () => {
  const landscape = clip('landscape.mp4', '640x360');
  const rotated = join(dir, 'rotated.mp4');
  execFileSync(ffmpegPath, ['-v', 'error', '-y', '-i', landscape, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', rotated]);
  const out = join(dir, 'portrait.jpg');
  await extractPoster(rotated, out, 1);
  assert.equal(sizeOf(out), 'mjpeg,360,640');
});

test('no frame to take is an error for the caller to shrug off', async () => {
  await assert.rejects(extractPoster(clip('short.mp4', '320x180'), join(dir, 'late.jpg'), 30));
  const garbage = join(dir, 'garbage.mp4');
  writeFileSync(garbage, Buffer.alloc(2048, 1));
  await assert.rejects(extractPoster(garbage, join(dir, 'garbage.jpg'), 1));
});
