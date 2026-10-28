import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configProblems } from './validate.js';

const complete = {
  TRANCODER_API_KEY: 'k',
  BACKEND_API_URL: 'http://localhost:5000',
  KAFKA_BROKERS: 'localhost:9092',
  S3_RAW_VIDEO_BUCKET: 'raw-video',
  S3_PROCESSED_VIDEO_BUCKET: 'processed-video',
};
const binaries = { FFmpeg: '/bin/ffmpeg', FFprobe: '/bin/ffprobe' };

test('a complete config has no problems', () => {
  assert.deepEqual(configProblems(complete, binaries, () => true), []);
});

test('every missing or blank variable is reported, not just the first', () => {
  const problems = configProblems({ ...complete, TRANCODER_API_KEY: ' ', S3_PROCESSED_VIDEO_BUCKET: undefined }, binaries, () => true);
  assert.deepEqual(problems, ['TRANCODER_API_KEY is not set', 'S3_PROCESSED_VIDEO_BUCKET is not set']);
});

test('a missing FFmpeg or FFprobe binary is a startup problem', () => {
  const problems = configProblems(complete, { FFmpeg: '/nope/ffmpeg', FFprobe: '/nope/ffprobe' }, () => false);
  assert.deepEqual(problems, ['FFmpeg is not executable at /nope/ffmpeg', 'FFprobe is not executable at /nope/ffprobe']);
});

test('the optional transcode settings are accepted when valid', () => {
  const env = { ...complete, TRANSCODE_MAX_RUNG: '1080', TRANSCODE_PRESET: 'medium' };
  assert.deepEqual(configProblems(env, binaries, () => true), []);
});

test('a bad max rung or preset is caught at startup, not on the first upload', () => {
  for (const TRANSCODE_MAX_RUNG of ['4k', '0', '144', '-1', '1080.5']) {
    const problems = configProblems({ ...complete, TRANSCODE_MAX_RUNG }, binaries, () => true);
    assert.equal(problems.length, 1, TRANSCODE_MAX_RUNG);
    assert.match(problems[0]!, /TRANSCODE_MAX_RUNG/);
  }
  const problems = configProblems({ ...complete, TRANSCODE_PRESET: 'veryfastt' }, binaries, () => true);
  assert.match(problems[0]!, /TRANSCODE_PRESET must be one of/);
});
