import { env } from '@/config/env';
import type { CourseVideo } from '@/lib/api';

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
