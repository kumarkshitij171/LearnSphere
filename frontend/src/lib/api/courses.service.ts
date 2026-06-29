import { apiClient } from './client';
import { endpoints } from './endpoints';

export type VideoStatus = 'UPLOADED' | 'TRANSCODING' | 'READY' | 'FAILED';

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  price: number;
  thumbnail?: string | null;
  isPublished: boolean;
  instructorId: string;
  instructor?: { id: string; name: string; email: string };
  _count?: { videos: number; enrollments?: number };
  createdAt: string;
}

export interface CourseVideo {
  id: string;
  title: string;
  description?: string | null;
  status: VideoStatus;
  hlsMasterPath?: string | null;
  duration?: number | null;
}

export interface CourseDetail extends CourseSummary {
  enrolled: boolean;
  canAccessVideos: boolean;
  videos: CourseVideo[];
}

export interface CreateCoursePayload {
  title: string;
  description: string;
  price?: number;
  thumbnail?: string;
}

export const coursesApi = {
  async list(): Promise<CourseSummary[]> {
    const { data } = await apiClient.get(endpoints.courses.list);
    return data?.courses ?? [];
  },
  async mine(): Promise<CourseSummary[]> {
    const { data } = await apiClient.get(endpoints.courses.mine);
    return data?.courses ?? [];
  },
  async getById(id: string): Promise<CourseDetail> {
    const { data } = await apiClient.get(endpoints.courses.byId(id));
    return data.course;
  },
  async create(payload: CreateCoursePayload): Promise<CourseSummary> {
    const { data } = await apiClient.post(endpoints.courses.create, payload);
    return data.course;
  },
  update(id: string, payload: Partial<CreateCoursePayload> & { isPublished?: boolean }) {
    return apiClient.patch(endpoints.courses.byId(id), payload);
  },
  remove(id: string) {
    return apiClient.delete(endpoints.courses.byId(id));
  },
  enroll(id: string) {
    return apiClient.post(endpoints.courses.enroll(id));
  },
};
