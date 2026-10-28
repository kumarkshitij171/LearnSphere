import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { CourseSummary } from './courses.service';
import type { Role } from './users.service';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface InstructorRequest {
  id: string;
  status: RequestStatus;
  message?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: Role };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isVerified: boolean;
  createdAt: string;
}

export interface PaginatedUsers {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const adminApi = {
  async listInstructorRequests(status?: RequestStatus): Promise<InstructorRequest[]> {
    const { data } = await apiClient.get(endpoints.admin.instructorRequests, {
      params: status ? { status } : {},
    });
    return data?.requests ?? [];
  },
  approveRequest(id: string) {
    return apiClient.post(endpoints.admin.approveRequest(id));
  },
  rejectRequest(id: string) {
    return apiClient.post(endpoints.admin.rejectRequest(id));
  },
  async listUsers(
    params: { page?: number; limit?: number; search?: string; role?: Role } = {}
  ): Promise<PaginatedUsers> {
    const { data } = await apiClient.get(endpoints.admin.users, { params });
    return data;
  },
  setUserRole(id: string, role: Role) {
    return apiClient.patch(endpoints.admin.userRole(id), { role });
  },
  /** every course, drafts included */
  async listCourses(): Promise<CourseSummary[]> {
    const { data } = await apiClient.get(endpoints.admin.courses);
    return data?.courses ?? [];
  },
};

export const instructorApi = {
  requestAccess(message?: string) {
    return apiClient.post(endpoints.instructorRequests.create, { message });
  },
  async myRequest(): Promise<InstructorRequest | null> {
    const { data } = await apiClient.get(endpoints.instructorRequests.me);
    return data?.request ?? null;
  },
};
