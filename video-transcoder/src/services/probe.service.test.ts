import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { codecsOf, probeSource, toSourceInfo, type ProbeOutput } from './probe.service.js';
import { ffmpegPath } from '../config/ffmpeg.js';
import { PermanentError } from '../errors.js';

const video = (extra: Record<string, unknown> = {}) => ({
  codec_type: 'video',
  codec_name: 'h264',
  width: 1920,
  height: 1080,
  sample_aspect_ratio: '1:1',
  avg_frame_rate: '30000/1001',
  r_frame_rate: '30000/1001',
  bit_rate: '4500000',
  ...extra,
});
const audio = { codec_type: 'audio', codec_name: 'aac' };
const probe = (...streams: object[]): ProbeOutput => ({ streams, format: { duration: '61.6', bit_rate: '4700000' } });

const isCorrupt = (e: unknown) =>
  e instanceof PermanentError && e.code === 'CORRUPT_OR_UNSUPPORTED' && /unsupported or corrupt video/.test(e.message);

test('reads size, frame rate, duration, bitrate, audio and codec', () => {
  assert.deepEqual(toSourceInfo(probe(video(), audio)), {
    width: 1920,
    height: 1080,
    fps: 30000 / 1001,
    durationSec: 61.6,
    bitrateKbps: 4500,
    hasAudio: true,
    codec: 'h264',
    hdr: false,
  });
});

test('a phone clip tagged rotate=90 is reported in its display orientation', () => {
  const info = toSourceInfo(probe(video({ tags: { rotate: '90' } })));
  assert.deepEqual([info.width, info.height], [1080, 1920]);
});

test('display-matrix rotation is honoured whatever its sign; a half turn changes nothing', () => {
  for (const rotation of [-90, 90, 270, -270]) {
    const info = toSourceInfo(probe(video({ side_data_list: [{ side_data_type: 'Display Matrix', rotation }] })));
    assert.deepEqual([info.width, info.height], [1080, 1920], `rotation ${rotation}`);
  }
  const flipped = toSourceInfo(probe(video({ side_data_list: [{ rotation: 180 }], tags: { rotate: '180' } })));
  assert.deepEqual([flipped.width, flipped.height], [1920, 1080]);
});

test('anamorphic pixels are applied, so the ladder sees the display shape', () => {
  const info = toSourceInfo(probe(video({ width: 720, height: 480, sample_aspect_ratio: '8:9' })));
  assert.deepEqual([info.width, info.height], [640, 480]);
});

test('PQ and HLG transfer are HDR', () => {
  assert.equal(toSourceInfo(probe(video({ color_transfer: 'smpte2084' }))).hdr, true);
  assert.equal(toSourceInfo(probe(video({ color_transfer: 'arib-std-b67' }))).hdr, true);
  assert.equal(toSourceInfo(probe(video({ color_transfer: 'bt709' }))).hdr, false);
});

test('missing numbers fall back sensibly', () => {
  const info = toSourceInfo({ streams: [video({ avg_frame_rate: '0/0', r_frame_rate: '25/1', bit_rate: undefined })], format: { bit_rate: '2000000' } });
  assert.equal(info.fps, 25);
  assert.equal(info.bitrateKbps, 2000);
  assert.equal(info.durationSec, 0);
  const bare = toSourceInfo({ streams: [video({ avg_frame_rate: undefined, r_frame_rate: undefined, bit_rate: 'N/A' })] });
  assert.equal(bare.fps, 30);
  assert.equal('bitrateKbps' in bare, false);
  assert.equal(bare.hasAudio, false);
});

test('cover art is skipped in favour of the real video stream', () => {
  const info = toSourceInfo(probe(video({ width: 3000, height: 3000, codec_name: 'mjpeg', disposition: { attached_pic: 1 } }), video({ width: 1280, height: 720 })));
  assert.deepEqual([info.width, info.height, info.codec], [1280, 720, 'h264']);
});

test('no usable video stream is permanent: unsupported or corrupt', () => {
  assert.throws(() => toSourceInfo(probe(audio)), isCorrupt);
  assert.throws(() => toSourceInfo({}), isCorrupt);
  assert.throws(() => toSourceInfo(probe(video({ disposition: { attached_pic: 1 } }))), isCorrupt);
  assert.throws(() => toSourceInfo(probe(video({ width: 0, height: 0 }))), isCorrupt);
});

test('CODECS comes from the encoded stream', () => {
  assert.equal(codecsOf(probe(video({ profile: 'High', level: 40 }), audio)), 'avc1.640028,mp4a.40.2');
  assert.equal(codecsOf(probe(video({ profile: 'High', level: 51 }))), 'avc1.640033');
  assert.equal(codecsOf(probe(video({ profile: 'Main', level: 31 }))), undefined);
  assert.equal(codecsOf(probe(video({ codec_name: 'hevc', profile: 'High', level: 40 }))), undefined);
});

// against the real bundled ffprobe, so the JSON shape assumed above is the one it produces
const dir = mkdtempSync(join(tmpdir(), 'probe-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

test('a real rotated clip probes as portrait', async () => {
  const plain = join(dir, 'plain.mp4');
  const rotated = join(dir, 'rotated.mp4');
  const ff = (...args: string[]) => execFileSync(ffmpegPath, ['-v', 'error', '-y', ...args]);
  ff('-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=30:duration=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', plain);
  ff('-i', plain, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', rotated);

  const landscape = await probeSource(plain);
  assert.deepEqual([landscape.width, landscape.height, landscape.hasAudio, landscape.fps], [64, 36, false, 30]);
  const portrait = await probeSource(rotated);
  assert.deepEqual([portrait.width, portrait.height], [36, 64]);
});

test('a file that is not a video is rejected as permanent, without the temp path in the message', async () => {
  const garbage = join(dir, 'garbage.mp4');
  writeFileSync(garbage, Buffer.alloc(4096, 7));
  await assert.rejects(probeSource(garbage), (e: Error) => isCorrupt(e) && !e.message.includes(dir));
});
