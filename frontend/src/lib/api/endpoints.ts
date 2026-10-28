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
    enrolled: `${API_PREFIX}/courses/enrolled`,
    // instructor/admin grant; students buy through orders
    enroll: (id: string) => `${API_PREFIX}/courses/${id}/enroll`,
    // GET is public (a redirect to the image); PUT/DELETE are the owner's
    thumbnail: (id: string) => `${API_PREFIX}/courses/${id}/thumbnail`,
    thumbnailPresign: (id: string) => `${API_PREFIX}/courses/${id}/thumbnail/presign`,
  },
  // order-service paths (orderClient)
  orders: {
    create: `${API_PREFIX}/orders`,
    list: `${API_PREFIX}/orders`,
    providers: `${API_PREFIX}/orders/providers`,
    byId: (id: string) => `${API_PREFIX}/orders/${id}`,
    cancel: (id: string) => `${API_PREFIX}/orders/${id}/cancel`,
    retry: (id: string) => `${API_PREFIX}/orders/${id}/retry`,
    // dev-only stand-in for the payment gateway
    mockGateway: (providerOrderId: string, outcome: 'capture' | 'fail') =>
      `${API_PREFIX}/mock-gateway/orders/${providerOrderId}/${outcome}`,
  },
  // notification-service paths (notificationClient)
  devices: {
    register: `${API_PREFIX}/devices`,
    byToken: (token: string) => `${API_PREFIX}/devices/${encodeURIComponent(token)}`,
  },
  // notification-service: the signed-in user's in-app messages
  inbox: {
    list: `${API_PREFIX}/notifications/inbox`,
    read: `${API_PREFIX}/notifications/inbox/read`,
  },
  adminUiConfig: {
    root: `${API_PREFIX}/admin/ui-config`,
    schema: `${API_PREFIX}/admin/ui-config/schema`,
    versions: `${API_PREFIX}/admin/ui-config/versions`,
    version: (v: number) => `${API_PREFIX}/admin/ui-config/versions/${v}`,
    draft: `${API_PREFIX}/admin/ui-config/draft`,
    validate: `${API_PREFIX}/admin/ui-config/validate`,
    publish: `${API_PREFIX}/admin/ui-config/publish`,
    rollback: `${API_PREFIX}/admin/ui-config/rollback`,
  },
  adminOrders: {
    list: `${API_PREFIX}/admin/orders`,
    refund: (id: string) => `${API_PREFIX}/admin/orders/${id}/refund`,
  },
  videos: {
    presign: `${API_PREFIX}/video-upload/presign`,
    confirm: `${API_PREFIX}/video-upload`,
    byId: (id: string) => `${API_PREFIX}/video-upload/${id}`,
    replacePresign: (id: string) => `${API_PREFIX}/video-upload/${id}/replace/presign`,
    replace: (id: string) => `${API_PREFIX}/video-upload/${id}/replace`,
    retry: (id: string) => `${API_PREFIX}/video-upload/${id}/retry`,
    thumbnail: (id: string) => `${API_PREFIX}/video-upload/${id}/thumbnail`,
    thumbnailPresign: (id: string) => `${API_PREFIX}/video-upload/${id}/thumbnail/presign`,
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
    courses: `${API_PREFIX}/admin/courses`,
  },
} as const;
