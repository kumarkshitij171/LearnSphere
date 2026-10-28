import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterPlaylist, encoderOptions, type Variant } from './hls.js';
import { buildLadder } from './ladder.js';

const variant = (label: string, width: number, height: number, bandwidth: number, extra: Partial<Variant> = {}): Variant => ({
  label,
  width,
  height,
  fps: 30,
  videoKbps: 0,
  maxKbps: 0,
  bufKbps: 0,
  bandwidth,
  ...extra,
});

test('the master playlist starts at 720p, then lists the rest tallest first, whatever order they arrive in', () => {
  const master = buildMasterPlaylist([
    variant('480p', 854, 480, 1_412_000),
    variant('1080p', 1920, 1080, 5_478_000),
    variant('240p', 426, 240, 556_000),
    variant('720p', 1280, 720, 3_124_000),
  ]);
  const uris = master.split('\n').filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(uris, ['720p/playlist.m3u8', '1080p/playlist.m3u8', '480p/playlist.m3u8', '240p/playlist.m3u8']);
});

test('every #EXT-X-STREAM-INF is followed by its URI on the very next line', () => {
  const lines = buildMasterPlaylist(buildLadder({ width: 3840, height: 2160, fps: 30, durationSec: 9, hasAudio: true, codec: 'h264', hdr: false })).split('\n');
  const infs = lines.flatMap((line, i) => (line.startsWith('#EXT-X-STREAM-INF:') ? [i] : []));
  assert.equal(infs.length, 7);
  for (const i of infs) assert.match(lines[i + 1]!, /^\d+p\/playlist\.m3u8$/);
});

test('each entry carries its real resolution, bandwidth, frame rate and codecs', () => {
  const master = buildMasterPlaylist([
    variant('900p', 1600, 900, 4_183_000, { fps: 30000 / 1001, codecs: 'avc1.640028,mp4a.40.2' }),
    variant('720p', 720, 1280, 3_124_000, { fps: 60 }),
  ]);
  assert.equal(
    master,
    [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      '#EXT-X-STREAM-INF:BANDWIDTH=3124000,RESOLUTION=720x1280,FRAME-RATE=60.000',
      '720p/playlist.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=4183000,RESOLUTION=1600x900,FRAME-RATE=29.970,CODECS="avc1.640028,mp4a.40.2"',
      '900p/playlist.m3u8',
      '',
    ].join('\n')
  );
});

const [rung] = buildLadder({ width: 1280, height: 720, fps: 30, durationSec: 9, hasAudio: true, codec: 'h264', hdr: false });
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

test('each rendition is scaled to the ladder size with aligned keyframes and capped VBR', () => {
  const args = encoderOptions(rung!, { preset: 'veryfast', hasAudio: true, segmentPattern: '/t/720p/segment_%03d.ts' });
  assert.equal(flag(args, '-vf'), 'scale=1280:720');
  assert.equal(flag(args, '-preset'), 'veryfast');
  assert.equal(flag(args, '-profile:v'), 'high');
  assert.equal(flag(args, '-b:v'), '2800k');
  assert.equal(flag(args, '-maxrate'), '2996k');
  assert.equal(flag(args, '-bufsize'), '5600k');
  assert.equal(flag(args, '-force_key_frames'), 'expr:gte(t,n_forced*2)');
  assert.equal(flag(args, '-sc_threshold'), '0');
  assert.equal(flag(args, '-r'), '30');
  assert.equal(flag(args, '-c:a'), 'aac');
  assert.equal(flag(args, '-hls_time'), '6');
  assert.equal(flag(args, '-hls_playlist_type'), 'vod');
  assert.equal(flag(args, '-hls_flags'), 'independent_segments');
  assert.equal(flag(args, '-hls_segment_filename'), '/t/720p/segment_%03d.ts');
  // fluent-ffmpeg splits an option containing one space; none may contain any
  assert.ok(args.every((a) => !a.includes(' ')));
});

test('a source without audio is encoded with -an and no audio mapping', () => {
  const args = encoderOptions(rung!, { preset: 'medium', hasAudio: false, segmentPattern: 'x' });
  assert.ok(args.includes('-an'));
  assert.ok(!args.includes('-c:a'));
  assert.deepEqual(args.filter((a) => a.startsWith('0:')), ['0:V:0']);
});

test('a source smaller than 720p starts at its own top rendition', () => {
  const master = buildMasterPlaylist([variant('480p', 854, 480, 1_412_000), variant('240p', 426, 240, 556_000)]);
  const uris = master.split('\n').filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(uris, ['480p/playlist.m3u8', '240p/playlist.m3u8']);
});
