import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermanentError, isPermanent, processTranscodeMessage, type JobDeps } from './job.service.js';
import type { MarkProcessedPayload } from './backend-api.service.js';

const output = {
  hlsMasterPath: 'v1/master.m3u8',
  renditions: [{ label: '720p', width: 1280, height: 720, bandwidth: 2_928_000 }],
  durationSec: 61.6,
};
const message = { videoId: 'v1', bucket: 'raw', key: 'v1/original.mp4' };

const harness = (transcodeResults: Array<Error | typeof output>, reportImpl?: JobDeps['report']) => {
  const reports: MarkProcessedPayload['status'][] = [];
  const payloads: MarkProcessedPayload[] = [];
  const waits: number[] = [];
  let transcodes = 0;
  const deps: JobDeps = {
    transcode: async () => {
      const next = transcodeResults[transcodes++];
      if (next instanceof Error) throw next;
      return next!;
    },
    report:
      reportImpl ??
      (async (_id, payload) => {
        reports.push(payload.status);
        payloads.push(payload);
      }),
    heartbeat: async () => undefined,
    sleep: async (ms) => {
      waits.push(ms);
    },
    attempts: 3,
    backoffMs: (n) => n * 10,
  };
  return { deps, reports, payloads, waits, transcodes: () => transcodes };
};

test('a successful job reports TRANSCODING then READY with duration and renditions', async () => {
  const h = harness([output]);
  await processTranscodeMessage(message, h.deps);
  assert.deepEqual(h.reports, ['TRANSCODING', 'READY']);
  assert.equal(h.payloads[1]!.duration, 62);
  assert.deepEqual(h.payloads[1]!.resolutions, output.renditions);
});

test('a transient failure is retried with backoff, then succeeds', async () => {
  const h = harness([new Error('socket hang up'), new Error('ECONNRESET'), output]);
  await processTranscodeMessage(message, h.deps);
  assert.equal(h.transcodes(), 3);
  assert.deepEqual(h.waits, [10, 20]);
  assert.deepEqual(h.reports, ['TRANSCODING', 'READY']);
});

test('a permanent failure is reported FAILED once, without retrying', async () => {
  const h = harness([Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' })]);
  await processTranscodeMessage(message, h.deps);
  assert.equal(h.transcodes(), 1);
  assert.deepEqual(h.reports, ['TRANSCODING', 'FAILED']);
  assert.equal(h.payloads[1]!.errorCode, 'SOURCE_MISSING');
});

test('running out of attempts reports FAILED with the attempt count', async () => {
  const h = harness([new Error('boom'), new Error('boom'), new Error('boom')]);
  await processTranscodeMessage(message, h.deps);
  assert.equal(h.transcodes(), 3);
  assert.equal(h.payloads[h.payloads.length - 1]!.status, 'FAILED');
  assert.match(h.payloads[h.payloads.length - 1]!.error!, /gave up after 3 attempts/);
  assert.equal(h.payloads[h.payloads.length - 1]!.errorCode, 'GAVE_UP');
});

test('every FAILED report carries a code the UI can act on: replace the file, or retry', async () => {
  const cases: Array<[Error, string]> = [
    [new PermanentError('unsupported or corrupt video: no video stream', 'CORRUPT_OR_UNSUPPORTED'), 'CORRUPT_OR_UNSUPPORTED'],
    [new Error('ffmpeg exited with code 1: moov atom not found'), 'CORRUPT_OR_UNSUPPORTED'],
    [new Error('ffmpeg exited with code 1: Decoder (codec prores_raw) not found for input stream #0:0'), 'CORRUPT_OR_UNSUPPORTED'],
    [Object.assign(new Error('The specified key does not exist.'), { Code: 'NoSuchKey' }), 'SOURCE_MISSING'],
    [new PermanentError('something no retry can fix'), 'UNKNOWN'],
  ];
  for (const [error, code] of cases) {
    const h = harness([error]);
    await processTranscodeMessage(message, h.deps);
    assert.equal(h.transcodes(), 1, error.message);
    assert.deepEqual(h.payloads[1], { status: 'FAILED', error: error.message, errorCode: code });
  }
});

test('a READY report carries no error code', async () => {
  const h = harness([output]);
  await processTranscodeMessage(message, h.deps);
  assert.equal('errorCode' in h.payloads[1]!, false);
});

test('a message without a videoId is dropped without reporting', async () => {
  const h = harness([output]);
  await processTranscodeMessage({ bucket: 'raw', key: 'k' }, h.deps);
  assert.equal(h.transcodes(), 0);
  assert.deepEqual(h.reports, []);
});

test('a backend 4xx on the report is dropped, not redelivered', async () => {
  const h = harness([output], async () => {
    throw new PermanentError('Backend callback failed: 404 video not found');
  });
  await assert.doesNotReject(processTranscodeMessage(message, h.deps));
});

test('a report that cannot be delivered is rethrown so Kafka redelivers', async () => {
  let calls = 0;
  const h = harness([output], async (_id, payload) => {
    calls++;
    if (payload.status === 'READY') throw new Error('backend unreachable after 4 attempts');
  });
  await assert.rejects(processTranscodeMessage(message, h.deps), /backend unreachable/);
  assert.equal(calls, 2);
});

test('the consumer heartbeats while a long job runs', async () => {
  let beats = 0;
  const h = harness([]);
  h.deps.transcode = () => new Promise((resolve) => setTimeout(() => resolve(output), 60));
  h.deps.heartbeat = async () => {
    beats++;
  };
  h.deps.heartbeatEveryMs = 10;
  await processTranscodeMessage(message, h.deps);
  assert.ok(beats >= 3, `expected several heartbeats, got ${beats}`);
});

test('corrupt or missing input is permanent; network trouble is not', () => {
  assert.equal(isPermanent(Object.assign(new Error('x'), { name: 'NoSuchKey' })), true);
  assert.equal(isPermanent(new Error('ffmpeg exited: Invalid data found when processing input')), true);
  assert.equal(isPermanent(new Error('moov atom not found')), true);
  assert.equal(isPermanent(new Error('ECONNRESET')), false);
  assert.equal(isPermanent(Object.assign(new Error('x'), { name: 'NoSuchBucket' })), false);
});
