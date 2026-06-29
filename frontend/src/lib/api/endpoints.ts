/**
 * Central registry of API endpoint paths.
 *
 * Paths are relative to the API base URL configured on the axios client
 * (see `client.ts`). Keep every route the frontend talks to here so URLs are
 * never hand-typed across the codebase.
 */

const API_PREFIX = '/api/v1';

export const endpoints = {
  users: {
    register: `${API_PREFIX}/users/register`,
    login: `${API_PREFIX}/users/login`,
    logout: `${API_PREFIX}/users/logout`,
    refreshToken: `${API_PREFIX}/users/refresh-token`,
    verify: `${API_PREFIX}/users/verify`,
    reverifyEmail: `${API_PREFIX}/users/reverify-email`,
    me: `${API_PREFIX}/users/me`,
  },
  courses: {
    list: `${API_PREFIX}/courses`,
    mine: `${API_PREFIX}/courses/mine`,
    create: `${API_PREFIX}/courses`,
    byId: (id: string) => `${API_PREFIX}/courses/${id}`,
    enroll: (id: string) => `${API_PREFIX}/courses/${id}/enroll`,
  },
  videos: {
    presign: `${API_PREFIX}/video-upload/presign`,
    confirm: `${API_PREFIX}/video-upload`,
    byId: (id: string) => `${API_PREFIX}/video-upload/${id}`,
  },
  instructorRequests: {
    create: `${API_PREFIX}/instructor-requests`,
    me: `${API_PREFIX}/instructor-requests/me`,
  },
  admin: {
    instructorRequests: `${API_PREFIX}/admin/instructor-requests`,
    approveRequest: (id: string) => `${API_PREFIX}/admin/instructor-requests/${id}/approve`,
    rejectRequest: (id: string) => `${API_PREFIX}/admin/instructor-requests/${id}/reject`,
    users: `${API_PREFIX}/admin/users`,
    userRole: (id: string) => `${API_PREFIX}/admin/users/${id}/role`,
  },
} as const;
