import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractPoster, posterTime } from './poster.js';
import { contentTypeFor } from './s3.service.js';
import { ffmpegPath, ffprobePath } from '../config/ffmpeg.js';

const ids = Array.from({ length: 200 }, (_, i) => `lesson-${i}`);

test('the poster time is the same every time for the same video, so a retry takes the same frame', () => {
  for (const id of ['3f2b8c1e-0d4a-4b6f-9e21-7a5c3d9e8f10', 'lesson-7', '']) {
    assert.equal(posterTime(600, id), posterTime(600, id));
  }
});

test('the poster lands anywhere in 15–75% of the video, spread across videos', () => {
  const fractions = ids.map((id) => posterTime(1000, id) / 1000);
  for (const f of fractions) assert.ok(f >= 0.15 && f <= 0.75, `${f} outside 15–75%`);
  assert.ok(Math.min(...fractions) < 0.2, 'nothing near the start of the range');
  assert.ok(Math.max(...fractions) > 0.7, 'nothing near the end of the range');
  // a fifth of the range each: none empty, none hogging the ids
  const buckets = [0, 0, 0, 0, 0];
  for (const f of fractions) buckets[Math.min(4, Math.floor(((f - 0.15) / 0.6) * 5))]! += 1;
  for (const n of buckets) assert.ok(n > 20 && n < 70, `uneven spread: ${buckets.join(', ')}`);
  assert.ok(new Set(fractions).size > 190, 'different videos should get different frames');
});

test('the poster is never within 1 s of either end', () => {
  for (const duration of [3, 3.5, 4, 5, 6, 10]) {
    for (const id of ids) {
      const at = posterTime(duration, id);
      assert.ok(at >= 1 && at <= duration - 1, `${at}s in a ${duration}s clip`);
    }
  }
});

test('a clip under 3 s gets its middle, and an unknown duration the first frame', () => {
  assert.equal(posterTime(2.9, 'a'), 1.45);
  assert.equal(posterTime(1, 'a'), 0.5);
  assert.equal(posterTime(0.4, 'b'), 0.2);
  assert.equal(posterTime(0, 'c'), 0);
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
