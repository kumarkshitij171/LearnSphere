'use client';

import { useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';

const SECONDS = 5;

/** The end-of-lesson card: counts down, then plays the next lesson unless the viewer cancels. */
export function UpNext({
  title,
  thumbnail,
  onPlay,
  onCancel,
}: {
  title: string;
  thumbnail?: React.ReactNode;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    if (left <= 0) {
      onPlay();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 0.1), 100);
    return () => clearTimeout(t);
  }, [left, onPlay]);

  const r = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Up next</p>
        {thumbnail ? <div className="mx-auto aspect-video w-56 overflow-hidden rounded-xl ring-1 ring-white/15">{thumbnail}</div> : null}
        <p className="line-clamp-2 text-lg font-semibold">{title}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={onPlay}
            className="relative grid h-14 w-14 place-items-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
            aria-label={`Play now: ${title}`}
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" aria-hidden>
              <circle cx="28" cy="28" r={r} fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle
                cx="28"
                cy="28"
                r={r}
                fill="none"
                stroke="hsl(var(--highlight))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (left / SECONDS)}
              />
            </svg>
            <Play className="relative ml-0.5 h-5 w-5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
}
