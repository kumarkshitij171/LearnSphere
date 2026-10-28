import { PermanentError, type FailureCode } from '../errors.js';
import { logger } from '../utils/logger.js';
import type { MarkProcessedPayload } from './backend-api.service.js';
import type { TranscodeOptions, TranscodeOutput } from './transcode.service.js';

export { PermanentError };

const PERMANENT_FFMPEG = [
  'Invalid data found when processing input',
  'moov atom not found',
  'does not contain any stream',
  'no video stream',
  'Unsupported codec',
  'not found for input stream', // "Decoder (codec …) not found": this FFmpeg cannot decode it
];

/** The failure code of an error that no retry can fix, or undefined when a retry might help. */
const permanentCode = (error: unknown): FailureCode | undefined => {
  if (error instanceof PermanentError) return error.code;
  const e = error as { name?: string; Code?: string; message?: string };
  if (e?.name === 'NoSuchKey' || e?.Code === 'NoSuchKey') return 'SOURCE_MISSING';
  if (PERMANENT_FFMPEG.some((m) => e?.message?.includes(m))) return 'CORRUPT_OR_UNSUPPORTED';
  return undefined;
};

export const isPermanent = (error: unknown): boolean => permanentCode(error) !== undefined;

export interface JobMessage {
  videoId?: string;
  bucket: string;
  key: string;
  resolutions?: string[];
}

export interface JobDeps {
  transcode: (options: TranscodeOptions) => Promise<TranscodeOutput>;
  report: (videoId: string, payload: MarkProcessedPayload) => Promise<void>;
  heartbeat: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  backoffMs?: (attempt: number) => number;
  heartbeatEveryMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One `video.uploaded` message, start to finish. A transient failure is retried in place with
 * backoff; a permanent one, or running out of attempts, is reported FAILED exactly once. Only a
 * failure to *report* is thrown, so Kafka redelivers and the outcome is never lost.
 */
export const processTranscodeMessage = async (message: JobMessage, deps: JobDeps): Promise<void> => {
  const { videoId } = message;
  if (!videoId) {
    logger.error('Message missing videoId; nothing to report against, dropping it');
    return;
  }
  const sleep = deps.sleep ?? realSleep;
  const attempts = deps.attempts ?? 3;
  const backoffMs = deps.backoffMs ?? ((n) => 5000 * 4 ** (n - 1));

  // kafkajs does not heartbeat during a long eachMessage; without this a job longer than
  // sessionTimeout gets the consumer evicted and the same video transcoded twice
  const beat = setInterval(() => deps.heartbeat().catch(() => undefined), deps.heartbeatEveryMs ?? 5000);
  try {
    await deps.report(videoId, { status: 'TRANSCODING' });

    let output: TranscodeOutput | null = null;
    for (let attempt = 1; !output; attempt++) {
      try {
        output = await deps.transcode({
          bucket: message.bucket,
          key: message.key,
          videoId,
          ...(message.resolutions?.length ? { resolutions: message.resolutions } : {}),
        });
      } catch (error) {
        const reason = (error as Error)?.message || String(error);
        const code = permanentCode(error);
        if (code || attempt >= attempts) {
          const why = code ? reason : `${reason} (gave up after ${attempt} attempts)`;
          logger.error(`Transcode of ${videoId} failed: ${why}`);
          await deps.report(videoId, { status: 'FAILED', error: why, errorCode: code ?? 'GAVE_UP' });
          return;
        }
        const wait = backoffMs(attempt);
        logger.warn(`Transcode of ${videoId} failed (attempt ${attempt}/${attempts}), retrying in ${wait}ms: ${reason}`);
        await sleep(wait);
      }
    }

    await deps.report(videoId, {
      status: 'READY',
      hlsMasterPath: output.hlsMasterPath,
      ...(output.durationSec != null ? { duration: Math.round(output.durationSec) } : {}),
      resolutions: output.renditions,
    });
    logger.info(`Transcoded ${videoId}`, { renditions: output.renditions.map((r) => r.label) });
  } catch (error) {
    // the backend answered 4xx (e.g. the video was deleted mid-job): reporting again cannot help
    if (error instanceof PermanentError) {
      logger.error(`Backend rejected the report for ${videoId}, dropping it: ${error.message}`);
      return;
    }
    throw error;
  } finally {
    clearInterval(beat);
  }
};
