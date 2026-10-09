import type { CourseVideo, LessonErrorCode } from '@/lib/api';

export interface FailureCopy {
  message: string;
  /** offer "Retry processing" — pointless for a corrupt file, which would fail the same way */
  canRetry: boolean;
}

const FAILURES: Record<LessonErrorCode, FailureCopy> = {
  CORRUPT_OR_UNSUPPORTED: {
    message: "We couldn't process this file. It may be corrupt or in a format we don't support.",
    canRetry: false,
  },
  SOURCE_MISSING: { message: 'The uploaded file is no longer available. Upload it again.', canRetry: false },
  GAVE_UP: { message: 'Processing failed after several attempts.', canRetry: true },
  UNKNOWN: { message: 'Something went wrong while processing this lesson.', canRetry: true },
};

export function failureCopy(video: CourseVideo): FailureCopy {
  const code = video.metadata?.errorCode;
  if (code && code in FAILURES) return FAILURES[code];
  // rows from before error codes existed: infer from the stored text
  const text = video.metadata?.error ?? '';
  if (/Invalid data|moov atom|corrupt|unsupported|no video stream/i.test(text)) return FAILURES.CORRUPT_OR_UNSUPPORTED;
  if (/NoSuchKey|does not exist/i.test(text)) return FAILURES.SOURCE_MISSING;
  return FAILURES.UNKNOWN;
}

export const isProcessing = (v: CourseVideo) => v.status === 'UPLOADED' || v.status === 'TRANSCODING';
