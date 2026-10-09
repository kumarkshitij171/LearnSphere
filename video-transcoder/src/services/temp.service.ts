import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export const TEMP_ROOT = '/tmp/video-transcode';
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * A job killed mid-encode (a crash, a deploy, a dev-server restart) never reaches its cleanup, and
 * its download and renditions stay on disk. Anything older than any real job is swept.
 */
export function sweepStaleJobDirs(root = TEMP_ROOT, olderThanMs = STALE_AFTER_MS, now = Date.now()): number {
  let removed = 0;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return 0; // nothing has run yet
  }
  for (const name of entries) {
    const path = join(root, name);
    try {
      if (now - statSync(path).mtimeMs < olderThanMs) continue;
      rmSync(path, { recursive: true, force: true });
      removed++;
    } catch (error) {
      logger.warn(`Could not sweep ${path}`, { error });
    }
  }
  if (removed) logger.info(`Swept ${removed} stale transcode job director${removed === 1 ? 'y' : 'ies'} from ${root}`);
  return removed;
}
