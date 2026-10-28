/**
 * Pre-configured axios instances used by every API service, built by one factory so the
 * auth behaviour (single-flight refresh, non-refreshable paths) has one implementation.
 *
 * Base URLs come from the central config (`@/config/env`) — components and services never
 * reference `process.env` or hardcode a host.
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/config/env';
import { endpoints } from './endpoints';

/**
 * Endpoints that must never trigger — or be retried by — the refresh flow.
 * Their own 401/403 (e.g. bad password, "please verify") must reach callers.
 */
const NON_REFRESHABLE_PATHS = [
  endpoints.users.login,
  endpoints.users.register,
  endpoints.users.verify,
  endpoints.users.reverifyEmail,
  endpoints.users.refreshToken,
];

const isNonRefreshable = (url?: string) =>
  !!url && NON_REFRESHABLE_PATHS.some((path) => url.includes(path));

type SessionListener = () => void;
const sessionExpiredListeners = new Set<SessionListener>();

/** Notified once a refresh fails: the session is gone, whatever the UI still believes. */
export function onSessionExpired(listener: SessionListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

/**
 * Single-flight refresh: when several requests 401 at once — on any instance — only one
 * `/refresh-token` call is made; the rest await the same promise. Refresh is always a
 * backend concern, so it runs on `apiClient` even when an order-service call triggered it.
 */
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post(endpoints.users.refreshToken)
      .then(() => undefined)
      .catch((error) => {
        sessionExpiredListeners.forEach((listener) => listener());
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * On a 401 from a protected endpoint, transparently refresh the access token once and retry
 * the original request. The interceptor deliberately does NOT redirect on failure — callers
 * (dashboard, useGuestOnly) decide what to do — which avoids a reload loop on guest pages
 * that legitimately 401.
 */
export function createClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    // Auth uses httpOnly cookies, so credentials must travel with every request.
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retried?: boolean })
        | undefined;

      if (
        error.response?.status === 401 &&
        original &&
        !original._retried &&
        !isNonRefreshable(original.url)
      ) {
        original._retried = true;
        try {
          await refreshSession();
          return instance(original);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
}

/** backend: auth, catalogue, video upload. */
export const apiClient: AxiosInstance = createClient(env.apiBaseUrl);

/** order-service: orders, payments, refunds. */
export const orderClient: AxiosInstance = createClient(env.orderApiBaseUrl);

/** notification-service: device registration for push. */
export const notificationClient: AxiosInstance = createClient(env.notificationApiBaseUrl);

/** Shape of the JSON error body the backend returns. */
interface ApiErrorBody {
  message?: string;
  [key: string]: unknown;
}

/**
 * Normalizes any thrown error into a human-readable message, preferring the
 * backend's `message` field, then the axios message, then a fallback.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    return axiosError.response?.data?.message || axiosError.message || fallback;
  }

  if (error instanceof Error) return error.message || fallback;

  return fallback;
}

/** The HTTP status of a failed request, if it got that far. */
export function getApiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
