'use client';

import { useState } from 'react';
import { courseThumbnailUrl, posterUrl } from '@/lib/playback';
import { cn } from '@/lib/utils';

// Paper tints for a course with no image yet; picked by a stable hash so a course keeps its cover.
const TINTS: Array<[string, string]> = [
  ['#dfe8d8', '#1b2814'],
  ['#ffe9a8', '#352800'],
  ['#e6e1f5', '#261e45'],
  ['#dde9f2', '#132636'],
  ['#111113', '#f2f2f0'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The instructor's thumbnail when there is one; otherwise a frame from the first ready lesson (the
 * transcoder writes a poster per lesson); otherwise the title set like a title card. Never a gradient.
 */
export function CourseCover({
  id,
  title,
  thumbnail,
  coverVideoId,
  className,
  size = 'md',
  children,
}: {
  id: string;
  title: string;
  thumbnail?: string | null;
  coverVideoId?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}) {
  const sources = [
    thumbnail ? courseThumbnailUrl(id, thumbnail) : null,
    coverVideoId ? posterUrl({ id: coverVideoId, status: 'READY' }) : null,
  ].filter((s): s is string => !!s);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const [bg, fg] = TINTS[hash(id) % TINTS.length]!;

  return (
    <div className={cn('relative isolate overflow-hidden bg-surface', className)} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from storage via the API, not next/image's optimiser
        <img key={src} src={src} alt="" loading="lazy" onError={() => setFailed((n) => n + 1)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-end" style={{ backgroundColor: bg, color: fg }}>
          <span
            className={cn(
              'line-clamp-3 font-semibold leading-[1.05] tracking-[-0.03em]',
              size === 'sm' && 'p-2.5 text-[12px]',
              size === 'md' && 'max-w-[85%] p-4 text-[17px]',
              size === 'lg' && 'max-w-[80%] p-6 text-[28px]'
            )}
          >
            {title}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
