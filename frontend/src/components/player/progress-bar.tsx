'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { formatTime, spokenTime } from './time';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  onSeek: (seconds: number) => void;
  /** dragging keeps the controls visible and the bar under the finger */
  onScrubChange?: (scrubbing: boolean) => void;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0);

export function ProgressBar({ currentTime, duration, bufferedEnd, onSeek, onScrubChange }: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (Math.min(Math.max(clientX - rect.left, 0), rect.width) / rect.width) * duration;
  };
  const xWithin = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect ? Math.min(Math.max(clientX - rect.left, 0), rect.width) : 0;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragTime(timeAt(e.clientX));
    onScrubChange?.(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setHoverX(xWithin(e.clientX));
    if (dragTime !== null) setDragTime(timeAt(e.clientX));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragTime === null) return;
    onSeek(timeAt(e.clientX));
    setDragTime(null);
    onScrubChange?.(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : null;
    if (step !== null) {
      e.preventDefault();
      e.stopPropagation();
      onSeek(currentTime + step);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      onSeek(e.key === 'Home' ? 0 : duration);
    }
  };

  const shown = dragTime ?? currentTime;
  const width = trackRef.current?.getBoundingClientRect().width ?? 0;
  const tipX = dragTime !== null ? pct(dragTime, duration) * (width / 100) : hoverX;
  const tipTime = dragTime ?? (hoverX !== null && width ? (hoverX / width) * duration : null);
  const active = hoverX !== null || dragTime !== null;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={Math.floor(shown)}
      aria-valuetext={`${spokenTime(shown)} of ${spokenTime(duration)}`}
      className="group/bar relative flex h-5 cursor-pointer touch-none items-center outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHoverX(null)}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          'relative h-[3px] w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150',
          active && 'h-[5px]',
          'group-focus-visible/bar:h-[5px]'
        )}
      >
        <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${pct(bufferedEnd, duration)}%` }} />
        {hoverX !== null && dragTime === null ? (
          <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${(hoverX / (width || 1)) * 100}%` }} />
        ) : null}
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${pct(shown, duration)}%` }} />
      </div>

      <div
        className={cn(
          'pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25)] transition-transform duration-150',
          active ? 'scale-100' : 'scale-0 group-focus-visible/bar:scale-100'
        )}
        style={{ left: `${pct(shown, duration)}%` }}
      />

      {tipX !== null && tipTime !== null && duration > 0 ? (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 font-mono text-xs tabular-nums text-white shadow-lg ring-1 ring-white/10"
          style={{ left: Math.min(Math.max(tipX, 24), Math.max(24, width - 24)) }}
        >
          {formatTime(tipTime)}
        </div>
      ) : null}
    </div>
  );
}
