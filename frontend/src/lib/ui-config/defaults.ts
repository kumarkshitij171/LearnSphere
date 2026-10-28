import type { UiConfig } from './types';
import defaults from './ui-config.default.json';

/**
 * The shipped UI. Rendered whenever the published config cannot be fetched, so a backend outage
 * shows the app as designed rather than an error. A copy of
 * backend/config/ui/ui-config.default.json — `npm run ui-config:sync` refreshes it, and a
 * backend test fails if the two drift.
 */
export const DEFAULT_UI_CONFIG = defaults as UiConfig;

/** Cheap shape check before trusting a fetched document; the backend did the real validation. */
export function looksLikeUiConfig(value: unknown): value is UiConfig {
  const doc = value as Partial<UiConfig> | null;
  return (
    !!doc &&
    doc.schemaVersion === 2 &&
    !!doc.branding &&
    !!doc.theme &&
    Array.isArray(doc.navigation?.sidebar) &&
    Array.isArray(doc.navigation?.sidebarBottom) &&
    !!doc.home?.hero &&
    !!doc.home?.features &&
    !!doc.auth &&
    !!doc.features &&
    !!doc.copy &&
    !!doc.announcement
  );
}
