import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { markVideoProcessed } from './backend-api.service.js';
import { PermanentError } from '../errors.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const respond = (...statuses: Array<number | Error>) => {
  let i = 0;
  globalThis.fetch = (async () => {
    const next = statuses[i++] ?? 200;
    if (next instanceof Error) throw next;
    return new Response('body', { status: next });
  }) as typeof fetch;
  return () => i;
};

test('retries network errors and 5xx, then succeeds', async () => {
  const calls = respond(new Error('ECONNREFUSED'), 502, 200);
  await markVideoProcessed('v1', { status: 'READY' }, [0, 0, 0]);
  assert.equal(calls(), 3);
});

test('a 4xx is permanent and not retried', async () => {
  const calls = respond(404);
  await assert.rejects(markVideoProcessed('v1', { status: 'READY' }, [0, 0, 0]), PermanentError);
  assert.equal(calls(), 1);
});

test('429 is retried, not treated as permanent', async () => {
  const calls = respond(429, 200);
  await markVideoProcessed('v1', { status: 'READY' }, [0]);
  assert.equal(calls(), 2);
});

test('gives up after the last delay with a plain (retryable) error', async () => {
  const calls = respond(503, 503, 503);
  await assert.rejects(markVideoProcessed('v1', { status: 'READY' }, [0, 0]), (e: Error) =>
    !(e instanceof PermanentError) && /after 3 attempts/.test(e.message)
  );
  assert.equal(calls(), 3);
});
