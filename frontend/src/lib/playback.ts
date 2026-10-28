import { env } from '@/config/env';
import { endpoints, type CourseVideo } from '@/lib/api';

// Resolve a playable HLS master URL for a video.
// NOTE: robust S3-backed signed playback is a follow-up; for now we use the
// hlsMasterPath when it's already a URL, else fall back to the transcoder host.
export function masterPlaylistUrl(video: CourseVideo): string {
  const path = video.hlsMasterPath || '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = env.transcoderUrl.replace(/\/$/, '');
  if (path) return `${base}/api/video-transcoder/hls/${path.replace(/^\//, '')}`;
  return `${base}/api/video-transcoder/hls/master.m3u8`;
}

/** The transcoder writes one frame per video next to its HLS output ({videoId}/poster.jpg). */
export function posterUrl(video: Pick<CourseVideo, 'id' | 'status'>): string | null {
  if (video.status !== 'READY') return null;
  return `${env.transcoderUrl.replace(/\/$/, '')}/api/video-transcoder/hls/${video.id}/poster.jpg`;
}

// An uploaded thumbnail is served by the backend as a redirect to storage; the key in the query string
// changes with every upload, so a browser never shows a replaced image from its cache.
export function courseThumbnailUrl(courseId: string, key: string): string {
  return `${env.apiBaseUrl.replace(/\/$/, '')}${endpoints.courses.thumbnail(courseId)}?v=${encodeURIComponent(key)}`;
}

export function lessonThumbnailUrl(videoId: string, key: string): string {
  return `${env.apiBaseUrl.replace(/\/$/, '')}${endpoints.videos.thumbnail(videoId)}?v=${encodeURIComponent(key)}`;
}
