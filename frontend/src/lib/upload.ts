import { videosApi, type CourseVideo } from '@/lib/api';

export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3; // one presigned PUT; multipart is recorded as later work
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|3gp|wmv|flv|ts|mts)$/i;

/** Why this file cannot be uploaded, or null when it can. Checked before any byte is sent. */
export function uploadProblem(file: File): string | null {
  if (!file.type.startsWith('video/') && !VIDEO_EXTENSIONS.test(file.name)) {
    return "That doesn't look like a video. Choose an MP4, MOV, WebM or another video file.";
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Videos can be up to 5 GB. Compress or trim this one and try again.';
  return null;
}

export interface UploadProgress {
  percent: number;
  bytesPerSecond: number;
  secondsLeft: number | null;
}

async function putWithProgress(
  uploadUrl: string,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal }
) {
  // speed from a moving window of the last few seconds, so the estimate settles instead of jumping
  const samples: Array<{ t: number; loaded: number }> = [];
  await videosApi.uploadToS3(
    uploadUrl,
    file,
    ({ percent, loaded, total }) => {
      const now = performance.now();
      samples.push({ t: now, loaded });
      while (samples.length > 2 && now - samples[0]!.t > 5000) samples.shift();
      const first = samples[0]!;
      const elapsed = (now - first.t) / 1000;
      const bytesPerSecond = elapsed > 0.25 ? (loaded - first.loaded) / elapsed : 0;
      opts.onProgress?.({
        percent,
        bytesPerSecond,
        secondsLeft: bytesPerSecond > 0 ? (total - loaded) / bytesPerSecond : null,
      });
    },
    opts.signal
  );
  if (opts.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
}

/** presign → PUT straight to storage → confirm. A cancelled upload never confirms, so no orphan lesson. */
export async function uploadLesson(
  file: File,
  lesson: { courseId: string; title: string; description?: string },
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {}
): Promise<CourseVideo> {
  const mimeType = file.type || 'video/mp4';
  const { uploadUrl, videoId, key } = await videosApi.presign(lesson.courseId, mimeType);
  await putWithProgress(uploadUrl, file, opts);
  return videosApi.confirm({
    videoId,
    courseId: lesson.courseId,
    title: lesson.title,
    ...(lesson.description ? { description: lesson.description } : {}),
    mimeType,
    fileName: file.name,
    fileSize: file.size,
    originalKey: key,
  });
}

/** Swap the file behind an existing lesson; it keeps its id, title and place in the course. */
export async function replaceLessonFile(
  lessonId: string,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {}
): Promise<CourseVideo> {
  const mimeType = file.type || 'video/mp4';
  const { uploadUrl } = await videosApi.presignReplacement(lessonId, mimeType);
  await putWithProgress(uploadUrl, file, opts);
  return videosApi.confirmReplacement(lessonId, { mimeType, fileName: file.name, fileSize: file.size });
}

export interface LocalVideoInfo {
  width: number;
  height: number;
  duration: number;
  /** a frame from early in the clip, as a data URL, for the file card */
  poster: string | null;
}

/**
 * What the browser can tell about the file before uploading. Many formats FFmpeg handles
 * (ProRes, some HEVC) are unreadable here, so this is a preview, never a gate: null means unknown.
 */
export function probeLocalVideo(file: File, timeoutMs = 5000): Promise<LocalVideoInfo | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const done = (info: LocalVideoInfo | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(info);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      if (!video.videoWidth) return done(null);
      video.currentTime = Math.min(1, (video.duration || 2) / 3);
    };
    video.onseeked = () => {
      let poster: string | null = null;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        poster = canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        poster = null;
      }
      done({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, poster });
    };
    video.src = url;
  });
}
