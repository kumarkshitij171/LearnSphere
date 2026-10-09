/**
 * Central, type-safe access to environment configuration.
 *
 * This is the ONLY place in the app that reads `process.env`. Everything else
 * imports the typed `env` object from here, so we have a single source of truth
 * for URLs/flags and one place to validate them at startup.
 *
 * NOTE: Next.js inlines `NEXT_PUBLIC_*` variables at build time, so each one
 * must be referenced statically (no dynamic `process.env[key]` lookups).
 */

type EnvVarOptions = {
  /** Used in non-production when the variable is missing. */
  fallback?: string;
};

function readEnv(
  key: string,
  rawValue: string | undefined,
  { fallback }: EnvVarOptions = {}
): string {
  const value = rawValue?.trim();

  if (value) return value;

  // In production we want a loud failure rather than silently pointing at a
  // localhost default that will never work for real users.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[config] Missing required environment variable "${key}". ` +
        `Set it in your deployment environment.`
    );
  }

  if (fallback !== undefined) {
    if (typeof window === 'undefined') {
      // Server-side only — avoid noisy logs in the browser console.
      console.warn(
        `[config] "${key}" is not set; falling back to "${fallback}" (development only).`
      );
    }
    return fallback;
  }

  throw new Error(`[config] Missing required environment variable "${key}".`);
}

/** For features that are simply off when unconfigured (push), rather than broken. */
function readOptional(rawValue: string | undefined): string | null {
  const value = rawValue?.trim();
  return value ? value : null;
}

export const env = Object.freeze({
  /** Base URL of the LMS backend API */
  apiBaseUrl: readEnv(
    'NEXT_PUBLIC_API_BASE_URL',
    process.env.NEXT_PUBLIC_API_BASE_URL,
    { fallback: 'http://localhost:5001' }
  ),

  /** Base URL of order-service (orders, payments, refunds). */
  orderApiBaseUrl: readEnv(
    'NEXT_PUBLIC_ORDER_API_URL',
    process.env.NEXT_PUBLIC_ORDER_API_URL,
    { fallback: 'http://localhost:8086' }
  ),

  /** Base URL of notification-service (device registration for push). */
  notificationApiBaseUrl: readEnv(
    'NEXT_PUBLIC_NOTIFICATION_API_URL',
    process.env.NEXT_PUBLIC_NOTIFICATION_API_URL,
    { fallback: 'http://localhost:8085' }
  ),

  /** Firebase web config for push. All optional: without them push is not offered. */
  firebase: Object.freeze({
    apiKey: readOptional(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    projectId: readOptional(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    messagingSenderId: readOptional(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: readOptional(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    vapidKey: readOptional(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
  }),

  /** Base URL of the video transcoder service. */
  transcoderUrl: readEnv(
    'NEXT_PUBLIC_TRANSCODER_URL',
    process.env.NEXT_PUBLIC_TRANSCODER_URL,
    { fallback: 'http://localhost:7070' }
  ),

  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
});

export type Env = typeof env;
