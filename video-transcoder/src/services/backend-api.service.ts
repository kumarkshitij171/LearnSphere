import { config } from '../config/conf.js';
import { PermanentError, type FailureCode } from '../errors.js';
import { logger } from '../utils/logger.js';

export interface RenditionInfo {
  label: string;
  width: number;
  height: number;
  bandwidth: number;
}

export interface MarkProcessedPayload {
  status: 'TRANSCODING' | 'READY' | 'FAILED';
  hlsMasterPath?: string;
  error?: string;
  errorCode?: FailureCode; // with FAILED: lets the UI offer "replace the file" or "retry processing"
  duration?: number;
  resolutions?: RenditionInfo[];
}

const RETRY_DELAYS_MS = [1000, 3000, 9000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reports a video's state to the backend. Network errors, 5xx and 429 are retried with backoff;
 * any other 4xx throws {@link PermanentError} — sending it again would get the same answer.
 */
export const markVideoProcessed = async (
  videoId: string,
  payload: MarkProcessedPayload,
  delays: number[] = RETRY_DELAYS_MS
): Promise<void> => {
  const { apiUrl, apiKey } = config.backend;
  const url = `${apiUrl}/api/v1/video-upload/${videoId}/processed`;

  for (let attempt = 0; ; attempt++) {
    let failure: string;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Transcoder-Api-Key': apiKey },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        logger.info(`Backend updated: ${videoId} -> ${payload.status}`);
        return;
      }
      const text = await res.text();
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        throw new PermanentError(`Backend callback failed: ${res.status} ${text}`);
      }
      failure = `${res.status} ${text}`;
    } catch (error) {
      if (error instanceof PermanentError) throw error;
      failure = (error as Error)?.message || String(error);
    }
    const delay = delays[attempt];
    if (delay === undefined) throw new Error(`Backend callback failed after ${attempt + 1} attempts: ${failure}`);
    logger.warn(`Backend callback for ${videoId} failed (${failure}), retrying in ${delay}ms`);
    await sleep(delay);
  }
};
