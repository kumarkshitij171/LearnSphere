'use client';

import { useState } from 'react';
import type { CourseVideo } from '@/lib/api';
import { lessonThumbnailUrl, posterUrl } from '@/lib/playback';
import { cn } from '@/lib/utils';
import { CourseCover } from './course-cover';

/** The instructor's thumbnail, else the transcoder's frame, else a title card. */
export function LessonThumbnail({
  video,
  className,
  children,
}: {
  video: Pick<CourseVideo, 'id' | 'title' | 'status' | 'thumbnail'>;
  className?: string;
  children?: React.ReactNode;
}) {
  const sources = [video.thumbnail ? lessonThumbnailUrl(video.id, video.thumbnail) : null, posterUrl(video)].filter(
    (s): s is string => !!s
  );
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  return (
    <div className={cn('relative overflow-hidden bg-surface', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" loading="lazy" onError={() => setFailed((n) => n + 1)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <CourseCover id={video.id} title={video.title} size="sm" className={cn('absolute inset-0', video.status !== 'READY' && 'opacity-60')} />
      )}
      {children}
    </div>
  );
}
