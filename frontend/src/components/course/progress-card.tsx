'use client';

import { CheckCircle2, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CourseVideo } from '@/lib/api';
import { resumePosition, type ProgressMap } from '@/lib/progress';
import { formatTime } from '@/components/player/time';

function Ring({ fraction }: { fraction: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(0 0% 100% / 0.08)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

/** Real progress: lessons watched to 90%, out of the lessons there are to watch. */
export function ProgressCard({
  lessons,
  progress,
  activeId,
  onPlay,
}: {
  lessons: CourseVideo[];
  progress: ProgressMap;
  activeId: string | null;
  onPlay: (lesson: CourseVideo) => void;
}) {
  if (lessons.length === 0) return null;
  const done = lessons.filter((l) => progress[l.id]?.completed).length;
  const fraction = done / lessons.length;
  const percent = Math.round(fraction * 100);
  const finished = done === lessons.length;
  // what to watch: the lesson on screen if it is unfinished, else the next unfinished one after it
  const activeIndex = lessons.findIndex((l) => l.id === activeId);
  const unfinished = (l: CourseVideo) => !progress[l.id]?.completed;
  const next =
    (activeIndex >= 0 && unfinished(lessons[activeIndex]!) ? lessons[activeIndex] : undefined) ??
    lessons.slice(activeIndex + 1).find(unfinished) ??
    lessons.find(unfinished);
  const resumeAt = next ? resumePosition(progress[next.id]) : null;

  return (
    <section className="rounded-[14px] border border-border bg-background p-5" aria-label="Your progress">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <Ring fraction={fraction} />
          <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{percent}%</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold">{finished ? 'Course complete' : 'Your progress'}</h3>
          <p className="text-sm text-muted-foreground">
            {done} of {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} completed
          </p>
        </div>
      </div>

      {finished ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm text-success ring-1 ring-success/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> You&apos;ve watched every lesson in this course.
        </div>
      ) : next ? (
        <button
          type="button"
          onClick={() => onPlay(next)}
          className="group mt-4 flex w-full items-center gap-3 rounded-xl bg-foreground/[0.04] p-3 text-left ring-1 ring-foreground/[0.06] transition hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-105">
            {resumeAt ? <RotateCcw className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">
              {next.id === activeId ? (resumeAt ? 'Continue watching' : 'Now playing') : done === 0 && !resumeAt ? 'Start with' : 'Up next'}
            </span>
            <span className="block truncate text-sm font-medium">{next.title}</span>
            {resumeAt ? <span className="block text-xs text-muted-foreground">from {formatTime(resumeAt)}</span> : null}
          </span>
        </button>
      ) : null}
      <p className="mt-3 text-[11px] text-muted-foreground/70">Progress is saved on this device.</p>
    </section>
  );
}
