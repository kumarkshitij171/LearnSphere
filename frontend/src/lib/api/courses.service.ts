import { apiClient } from './client';
import { endpoints } from './endpoints';

export type VideoStatus = 'UPLOADED' | 'TRANSCODING' | 'READY' | 'FAILED';

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  price: number;
  /** ISO 4217; the catalogue's single source for how a price is shown. */
  currency: string;
  thumbnail?: string | null;
  isPublished: boolean;
  instructorId: string;
  instructor?: { id: string; name: string; email: string };
  _count?: { videos: number; enrollments?: number };
  createdAt: string;
}

/** Why a lesson failed, set by the transcoder (video-transcoder/SYSTEM_DESIGN.md §7.1). */
export type LessonErrorCode = 'CORRUPT_OR_UNSUPPORTED' | 'SOURCE_MISSING' | 'GAVE_UP' | 'UNKNOWN';

export interface CourseVideo {
  id: string;
  title: string;
  description?: string | null;
  status: VideoStatus;
  hlsMasterPath?: string | null;
  duration?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  createdAt?: string;
  metadata?: { error?: string; errorCode?: LessonErrorCode } | null;
  resolutions?: Array<{ label: string; width: number; height: number; bandwidth: number }> | null;
}

export interface CourseDetail extends CourseSummary {
  enrolled: boolean;
  canAccessVideos: boolean;
  videos: CourseVideo[];
  /** ready lessons' titles and lengths, for everyone — what a buyer gets, without stream ids */
  curriculum?: Array<{ title: string; duration: number | null }>;
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
  async enrolled(): Promise<CourseSummary[]> {
    const { data } = await apiClient.get(endpoints.courses.enrolled);
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
  /** Instructor/admin grant. Students get 402 { requiresOrder } and must buy through ordersApi. */
  grant(id: string, userId: string) {
    return apiClient.post(endpoints.courses.enroll(id), { userId });
  },
};
