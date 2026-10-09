'use client';

import { useState } from 'react';
import type { CourseVideo } from '@/lib/api';
import { posterUrl } from '@/lib/playback';
import { cn } from '@/lib/utils';
import { CourseCover } from './course-cover';

/** A frame from the lesson when the transcoder has made one; generated cover art otherwise. */
export function LessonThumbnail({
  video,
  className,
  children,
}: {
  video: Pick<CourseVideo, 'id' | 'title' | 'status'>;
  className?: string;
  children?: React.ReactNode;
}) {
  const src = posterUrl(video);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-black', className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <CourseCover id={video.id} title={video.title} size="sm" className={cn('absolute inset-0', video.status !== 'READY' && 'opacity-50 saturate-50')} />
      )}
      {children}
    </div>
  );
}
