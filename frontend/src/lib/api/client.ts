/**
 * Pre-configured axios instance used by every API service.
 *
 * The base URL comes from the central config (`@/config/env`) — components and
 * services never reference `process.env` or hardcode `http://localhost:5001`.
 */

import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from '@/config/env';
import { endpoints } from './endpoints';

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  // Auth uses httpOnly cookies, so credentials must travel with every request.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

/**
 * Single-flight refresh: when several requests 401 at once, only one
 * `/refresh-token` call is made; the rest await the same promise.
 */
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post(endpoints.users.refreshToken)
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * On a 401 from a protected endpoint, transparently refresh the access token
 * once and retry the original request. The interceptor deliberately does NOT
 * redirect on failure — callers (dashboard, useGuestOnly) decide what to do —
 * which avoids a reload loop on guest pages that legitimately 401.
 */
apiClient.interceptors.response.use(
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
        return apiClient(original);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

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
