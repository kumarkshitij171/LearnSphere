/** Barrel export for the API layer — import from `@/lib/api`. */

export { apiClient, orderClient, notificationClient, getApiErrorMessage, getApiErrorStatus, onSessionExpired } from './client';
export { endpoints } from './endpoints';
export { usersApi } from './users.service';
export type {
  CurrentUser,
  Role,
  RegisterPayload,
  LoginPayload,
  VerifyPayload,
} from './users.service';

export { coursesApi } from './courses.service';
export type {
  CourseSummary,
  CourseDetail,
  CourseVideo,
  LessonErrorCode,
  CreateCoursePayload,
  VideoStatus,
} from './courses.service';

export { videosApi } from './videos.service';
export type { PresignResponse, ConfirmPayload } from './videos.service';

export { adminApi, instructorApi } from './admin.service';
export type {
  InstructorRequest,
  RequestStatus,
  AdminUser,
  PaginatedUsers,
} from './admin.service';

export { ordersApi, adminOrdersApi, TERMINAL_STATUSES } from './orders.service';
export type {
  Order,
  OrderStatus,
  OrderPage,
  OrderCheckout,
  PaymentProvider,
  CreateOrderPayload,
  RefundPayload,
} from './orders.service';

export { adminUiConfigApi } from './uiConfig.service';
export type {
  UiConfigProblem,
  UiConfigVersionMeta,
  UiConfigVersionDetail,
  UiConfigDraft,
  UiConfigAdminView,
  UiConfigHistory,
} from './uiConfig.service';

export { devicesApi } from './devices.service';
export type { DevicePlatform } from './devices.service';
