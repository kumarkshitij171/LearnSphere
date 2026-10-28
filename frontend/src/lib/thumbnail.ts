import { coursesApi, videosApi } from '@/lib/api';

// Must match the backend's allow-list (backend/services/asset.service.ts).
export const THUMBNAIL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export type ThumbnailTarget = { kind: 'course'; id: string } | { kind: 'lesson'; id: string };

/** Why a file cannot be a thumbnail, or null when it can. Checked before anything is uploaded. */
export function thumbnailProblem(file: File): string | null {
  if (!(THUMBNAIL_TYPES as readonly string[]).includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_THUMBNAIL_BYTES) return 'Images can be up to 5 MB.';
  return null;
}

/** presign → PUT straight to storage → confirm. Returns the stored key. */
export async function uploadThumbnail(
  target: ThumbnailTarget,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const api = target.kind === 'course' ? coursesApi : videosApi;
  const { uploadUrl, key } = await api.presignThumbnail(target.id, file.type);
  await videosApi.uploadToS3(uploadUrl, file, ({ percent }) => onProgress?.(percent), signal);
  return api.setThumbnail(target.id, key);
}

export function removeThumbnail(target: ThumbnailTarget) {
  return target.kind === 'course' ? coursesApi.removeThumbnail(target.id) : videosApi.removeThumbnail(target.id);
}
