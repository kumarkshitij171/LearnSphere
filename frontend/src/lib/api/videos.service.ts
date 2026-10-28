import axios from 'axios';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { CourseVideo, ThumbnailPresign } from './courses.service';

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
  uploadToS3(
    uploadUrl: string,
    file: File,
    onProgress?: (progress: { percent: number; loaded: number; total: number }) => void,
    signal?: AbortSignal
  ) {
    return axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type || 'video/mp4' },
      signal,
      onUploadProgress: (e) => {
        const total = e.total ?? file.size;
        if (onProgress && total) onProgress({ percent: Math.round((e.loaded * 100) / total), loaded: e.loaded, total });
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

  /** An upload URL for a new file under an existing lesson (same id, title and position). */
  async presignReplacement(id: string, contentType = 'video/mp4'): Promise<PresignResponse> {
    const { data } = await apiClient.post(endpoints.videos.replacePresign(id), { contentType });
    return data;
  },

  async confirmReplacement(id: string, file: { mimeType: string; fileName?: string; fileSize?: number }): Promise<CourseVideo> {
    const { data } = await apiClient.post(endpoints.videos.replace(id), file);
    return data.video;
  },

  async presignThumbnail(id: string, contentType: string): Promise<ThumbnailPresign> {
    const { data } = await apiClient.post(endpoints.videos.thumbnailPresign(id), { contentType });
    return { uploadUrl: data.uploadUrl, key: data.key };
  },

  async setThumbnail(id: string, key: string): Promise<string> {
    const { data } = await apiClient.put(endpoints.videos.thumbnail(id), { key });
    return data.thumbnail;
  },

  removeThumbnail(id: string) {
    return apiClient.delete(endpoints.videos.thumbnail(id));
  },

  /** Transcode a failed lesson again from its original upload. */
  async retry(id: string): Promise<CourseVideo> {
    const { data } = await apiClient.post(endpoints.videos.retry(id));
    return data.video;
  },
};
