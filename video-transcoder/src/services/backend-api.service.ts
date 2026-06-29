import { logger } from '../utils/logger.js';

const getBackendBaseUrl = (): string => {
  const url = process.env.BACKEND_API_URL || 'http://localhost:5001';
  return url.replace(/\/$/, '');
};

export interface MarkProcessedPayload {
  status: 'TRANSCODING' | 'READY' | 'FAILED';
  hlsMasterPath?: string;
  error?: string;
}

export const markVideoProcessed = async (
  videoId: string,
  payload: MarkProcessedPayload
): Promise<void> => {
  const baseUrl = getBackendBaseUrl();
  const apiKey = process.env.TRANCODER_API_KEY;
  if (!apiKey) {
    logger.warn('TRANCODER_API_KEY not set; skipping backend callback');
    return;
  }

  const url = `${baseUrl}/api/v1/video-upload/${videoId}/processed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transcoder-Api-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend callback failed: ${res.status} ${text}`);
  }
  logger.info(`Backend updated: ${videoId} -> ${payload.status}`);
};
