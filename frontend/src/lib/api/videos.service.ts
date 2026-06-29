import axios from 'axios';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { CourseVideo } from './courses.service';

export interface PresignResponse {
  uploadUrl: string;
  videoId: string;
  key: string;
}

export interface ConfirmPayload {
  videoId: string;
  courseId: string;
  title: string;
  description?: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  originalKey?: string;
}

export const videosApi = {
  async presign(courseId: string, contentType = 'video/mp4'): Promise<PresignResponse> {
    const { data } = await apiClient.post(endpoints.videos.presign, { courseId, contentType });
    return data;
  },

  // Direct PUT to S3/LocalStack — bare axios, no app baseURL/credentials.
  uploadToS3(uploadUrl: string, file: File, onProgress?: (pct: number) => void) {
    return axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type || 'video/mp4' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    });
  },

  async confirm(payload: ConfirmPayload): Promise<CourseVideo> {
    const { data } = await apiClient.post(endpoints.videos.confirm, payload);
    return data.video;
  },

  async getById(id: string): Promise<CourseVideo> {
    const { data } = await apiClient.get(endpoints.videos.byId(id));
    return data.video;
  },

  async update(id: string, payload: { title?: string; description?: string }): Promise<CourseVideo> {
    const { data } = await apiClient.patch(endpoints.videos.byId(id), payload);
    return data.video;
  },

  remove(id: string) {
    return apiClient.delete(endpoints.videos.byId(id));
  },
};
