'use client';

import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Flash {
  /** changes on every event so the same flash can replay */
  id: number;
  kind: 'play' | 'pause';
}
export interface Ripple {
  id: number;
  direction: -1 | 1;
  seconds: number;
}
export interface Chip {
  id: number;
  text: string;
}

interface CenterFeedbackProps {
  started: boolean;
  ended: boolean;
  waiting: boolean;
  flash: Flash | null;
  ripple: Ripple | null;
  chip: Chip | null;
  onPlay: () => void;
}

export function CenterFeedback({ started, ended, waiting, flash, ripple, chip, onPlay }: CenterFeedbackProps) {
  // a spinner that flickers for 80 ms on every seek is noise; only show a real stall
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (!waiting) return setShowSpinner(false);
    const t = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(t);
  }, [waiting]);

  return (
    <>
      {!started || ended ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          aria-label={ended ? 'Replay' : 'Play'}
          className="absolute left-1/2 top-1/2 z-10 grid h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md transition hover:scale-105 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {ended ? <RotateCcw className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8 fill-current" />}
        </button>
      ) : null}

      {showSpinner && started && !ended ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <Loader2 className="h-12 w-12 animate-spin text-white/90 drop-shadow-lg" />
        </div>
      ) : null}

      {flash && started ? (
        <div
          key={flash.id}
          className="player-flash pointer-events-none absolute left-1/2 top-1/2 z-10 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white"
        >
          {flash.kind === 'play' ? <Play className="ml-0.5 h-7 w-7 fill-current" /> : <Pause className="h-7 w-7 fill-current" />}
        </div>
      ) : null}

      {ripple ? (
        <div
          key={ripple.id}
          className={cn(
            'player-ripple pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/45 px-5 py-4 text-sm font-medium text-white backdrop-blur-sm',
            ripple.direction < 0 ? 'left-[12%]' : 'right-[12%]'
          )}
        >
          {ripple.direction < 0 ? <ChevronsLeft className="h-6 w-6" /> : <ChevronsRight className="h-6 w-6" />}
          {ripple.seconds} seconds
        </div>
      ) : null}

      {chip ? (
        <div
          key={chip.id}
          className="player-chip pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-semibold tabular-nums text-white ring-1 ring-white/10 backdrop-blur-md"
        >
          {chip.text}
        </div>
      ) : null}
    </>
  );
}
