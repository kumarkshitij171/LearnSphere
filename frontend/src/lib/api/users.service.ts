/**
 * Users / authentication API service.
 *
 * Thin, typed wrappers around the backend user routes. UI components call these
 * functions instead of constructing URLs or calling axios directly.
 */

import { apiClient } from './client';
import { endpoints } from './endpoints';

export type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface CurrentUser {
  id: string;
  name?: string;
  email?: string;
  role: Role;
  isVerified?: boolean;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface VerifyPayload {
  otp: string;
  /** Optional activation token from the email link; otherwise the cookie is used. */
  token?: string;
}

export const usersApi = {
  register(payload: RegisterPayload) {
    return apiClient.post(endpoints.users.register, payload);
  },

  login(payload: LoginPayload) {
    return apiClient.post(endpoints.users.login, payload);
  },

  verify(payload: VerifyPayload) {
    return apiClient.post(endpoints.users.verify, payload);
  },

  reverifyEmail(email: string) {
    return apiClient.get(endpoints.users.reverifyEmail, { params: { email } });
  },

  async getCurrentUser(): Promise<CurrentUser | null> {
    const { data } = await apiClient.get(endpoints.users.me);
    return data?.user ?? null;
  },

  logout() {
    return apiClient.get(endpoints.users.logout);
  },
};
