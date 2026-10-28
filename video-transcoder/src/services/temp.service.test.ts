import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sweepStaleJobDirs } from './temp.service.js';

test('removes job directories older than the threshold and keeps fresh ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'sweep-'));
  const old = join(root, 'transcode-old');
  const fresh = join(root, 'transcode-fresh');
  for (const dir of [old, fresh]) {
    mkdirSync(dir);
    writeFileSync(join(dir, 'input.mp4'), 'x');
  }
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  utimesSync(old, twoHoursAgo, twoHoursAgo);

  assert.equal(sweepStaleJobDirs(root), 1);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(fresh), true);
});

test('a missing root is not an error', () => {
  assert.equal(sweepStaleJobDirs(join(tmpdir(), 'does-not-exist-sweep')), 0);
});
