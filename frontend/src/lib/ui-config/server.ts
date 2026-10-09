import { env } from '@/config/env';
import { DEFAULT_UI_CONFIG, looksLikeUiConfig } from './defaults';
import type { PublishedUiConfig } from './types';

const FETCH_TIMEOUT_MS = 2000;

/**
 * Reads the published UI config on the server for every request — never from Next's data cache —
 * so what the database holds is what renders. Never throws: any failure renders today's UI.
 */
export async function loadUiConfig(): Promise<PublishedUiConfig> {
  try {
    const res = await fetch(`${env.apiBaseUrl}/api/v1/ui-config`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const body = await res.json();
      if (looksLikeUiConfig(body?.config)) {
        return { version: body.version, checksum: body.checksum, config: body.config, fallback: !!body.fallback };
      }
    }
  } catch {
    // backend down or slow: fall through to the bundled default
  }
  return { version: 0, checksum: 'bundled-default', config: DEFAULT_UI_CONFIG, fallback: true };
}
