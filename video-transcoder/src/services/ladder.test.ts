import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLadder, tierOf, type Rendition } from './ladder.js';
import type { SourceInfo } from './probe.service.js';

const source = (width: number, height: number, extra: Partial<SourceInfo> = {}): SourceInfo => ({
  width,
  height,
  fps: 30,
  durationSec: 60,
  hasAudio: true,
  codec: 'h264',
  hdr: false,
  ...extra,
});

const labels = (ladder: Rendition[]) => ladder.map((r) => r.label);
const sizes = (ladder: Rendition[]) => ladder.map((r) => `${r.width}x${r.height}`);

// every rendition: even, never larger than the source, aspect kept to within a pixel of rounding
const assertSane = (ladder: Rendition[], s: SourceInfo) => {
  for (const r of ladder) {
    assert.equal(r.width % 2, 0, `${r.label} width ${r.width} is odd`);
    assert.equal(r.height % 2, 0, `${r.label} height ${r.height} is odd`);
    assert.ok(r.width <= s.width && r.height <= s.height, `${r.label} ${r.width}x${r.height} upscales ${s.width}x${s.height}`);
    assert.ok(Math.abs(r.width / r.height - s.width / s.height) < 0.02 * (s.width / s.height), `${r.label} distorts the aspect`);
  }
};

test('tier is the height of the 16:9 box the video fits in', () => {
  assert.equal(tierOf(3840, 2160), 2160);
  assert.equal(tierOf(1920, 800), 1080);
  assert.equal(tierOf(1080, 1920), 1080);
  assert.equal(tierOf(1440, 1080), 1080);
  assert.equal(tierOf(1600, 900), 900);
});

// the §7.1 table, row by row
const table: Array<[number, number, string[], string[]]> = [
  [3840, 2160, ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'], ['3840x2160', '2560x1440', '1920x1080', '1280x720', '854x480', '640x360', '426x240']],
  [1920, 1080, ['1080p', '720p', '480p', '360p', '240p'], ['1920x1080', '1280x720', '854x480', '640x360', '426x240']],
  [1280, 720, ['720p', '480p', '360p', '240p'], ['1280x720', '854x480', '640x360', '426x240']],
  [854, 480, ['480p', '360p', '240p'], ['854x480', '640x360', '426x240']],
  [1600, 900, ['900p', '720p', '480p', '360p', '240p'], ['1600x900', '1280x720', '854x480', '640x360', '426x240']],
  [1080, 1920, ['1080p', '720p', '480p', '360p', '240p'], ['1080x1920', '720x1280', '480x854', '360x640', '240x426']],
  [320, 180, ['180p'], ['320x180']],
];
for (const [width, height, expectedLabels, expectedSizes] of table) {
  test(`${width}x${height} → ${expectedLabels.join(', ')}`, () => {
    const s = source(width, height);
    const ladder = buildLadder(s);
    assert.deepEqual(labels(ladder), expectedLabels);
    assert.deepEqual(sizes(ladder), expectedSizes);
    assertSane(ladder, s);
  });
}

test('a portrait source stays portrait at every rung', () => {
  for (const r of buildLadder(source(1080, 1920))) assert.ok(r.height > r.width, `${r.label} is ${r.width}x${r.height}`);
});

test('a 1920x800 film is "1080p", and every rung keeps its 2.4:1 shape', () => {
  const s = source(1920, 800);
  const ladder = buildLadder(s);
  assert.deepEqual(labels(ladder), ['1080p', '720p', '480p', '360p', '240p']);
  assert.deepEqual(sizes(ladder), ['1920x800', '1280x534', '854x356', '640x266', '426x178']);
  assertSane(ladder, s);
});

test('a 4:3 source keeps 4:3 rather than being stretched to 16:9', () => {
  const s = source(1440, 1080);
  const ladder = buildLadder(s);
  assert.deepEqual(labels(ladder), ['1080p', '720p', '480p', '360p', '240p']);
  assert.deepEqual(sizes(ladder), ['1440x1080', '960x720', '640x480', '480x360', '320x240']);
  assertSane(ladder, s);
});

test('bitrates follow the table at 30 fps, with capped VBR around them', () => {
  const ladder = buildLadder(source(3840, 2160));
  assert.deepEqual(ladder.map((r) => r.videoKbps), [14000, 8000, 5000, 2800, 1200, 800, 400]);
  const top = ladder[0]!;
  assert.equal(top.maxKbps, Math.round(14000 * 1.07));
  assert.equal(top.bufKbps, 28000);
  assert.equal(top.bandwidth, (top.maxKbps + 128) * 1000);
});

test('above 30 fps the bitrate is 1.5x, and the frame rate is capped at 60', () => {
  const at60 = buildLadder(source(1920, 1080, { fps: 60 }));
  assert.deepEqual(at60.map((r) => r.videoKbps), [7500, 4200, 1800, 1200, 600]);
  assert.ok(at60.every((r) => r.fps === 60));
  const at120 = buildLadder(source(1920, 1080, { fps: 120 }));
  assert.ok(at120.every((r) => r.fps === 60));
  const ntsc = buildLadder(source(1920, 1080, { fps: 30000 / 1001 }));
  assert.equal(ntsc[0]!.videoKbps, 5000);
  assert.equal(ntsc[0]!.fps, 30000 / 1001);
});

test('no rung is encoded above the source bitrate', () => {
  const ladder = buildLadder(source(1920, 1080, { bitrateKbps: 2000 }));
  assert.deepEqual(ladder.map((r) => r.videoKbps), [2000, 2000, 1200, 800, 400]);
});

test('a non-standard native rung interpolates its bitrate by pixel count', () => {
  const [top] = buildLadder(source(1600, 900));
  // 720p 2800 → 1080p 5000, 45% of the way by pixels
  assert.equal(top!.videoKbps, 3790);
  const [tiny] = buildLadder(source(320, 180));
  assert.equal(tiny!.videoKbps, 225);
});

test('nothing above TRANSCODE_MAX_RUNG; a taller source tops out there', () => {
  assert.deepEqual(labels(buildLadder(source(7680, 4320))), ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p']);
  assert.equal(sizes(buildLadder(source(7680, 4320)))[0], '3840x2160');
  assert.deepEqual(labels(buildLadder(source(3840, 2160), undefined, 1080)), ['1080p', '720p', '480p', '360p', '240p']);
});

test('a size within rounding of a standard rung takes its name instead of a near-duplicate', () => {
  assert.deepEqual(labels(buildLadder(source(1920, 1088))), ['1080p', '720p', '480p', '360p', '240p']);
  assert.deepEqual(labels(buildLadder(source(1281, 721))), ['720p', '480p', '360p', '240p']);
  assert.deepEqual(sizes(buildLadder(source(1281, 721))).slice(0, 1), ['1280x720']);
});

test('a cap intersects with what the source allows', () => {
  assert.deepEqual(labels(buildLadder(source(3840, 2160), ['720p', '480p'])), ['720p', '480p']);
});

test('a cap never upscales: asking for more than the source gets the source', () => {
  assert.deepEqual(labels(buildLadder(source(854, 480), ['1080p', '720p', '480p'])), ['480p']);
  assert.deepEqual(labels(buildLadder(source(1600, 900), ['1080p', '240p'])), ['900p', '240p']);
});

test('a cap that matches nothing is ignored rather than producing no video', () => {
  assert.deepEqual(labels(buildLadder(source(1280, 720), ['144p', 'best'])), ['720p', '480p', '360p', '240p']);
});

test('a source without audio is not charged for an audio track', () => {
  const [top] = buildLadder(source(1280, 720, { hasAudio: false }));
  assert.equal(top!.bandwidth, top!.maxKbps * 1000);
});
