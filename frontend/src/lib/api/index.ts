/** Barrel export for the API layer — import from `@/lib/api`. */

export { apiClient, getApiErrorMessage } from './client';
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
