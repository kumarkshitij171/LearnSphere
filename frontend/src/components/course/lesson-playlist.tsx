'use client';

import { CheckCircle2 } from 'lucide-react';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import type { CourseVideo } from '@/lib/api';
import { courseLength, lessonLength, pluralize } from '@/lib/format';
import { watchedFraction, type ProgressMap } from '@/lib/progress';
import { cn } from '@/lib/utils';

/** Animated bars marking the lesson that is playing, like YouTube's playlist. */
function NowPlaying() {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-label="Now playing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="player-eq w-[3px] rounded-sm bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export function LessonPlaylist({
  lessons,
  activeId,
  progress,
  onSelect,
  hiddenCount = 0,
  className,
}: {
  lessons: CourseVideo[];
  activeId: string | null;
  progress: ProgressMap;
  onSelect: (lesson: CourseVideo) => void;
  /** lessons not shown to students yet (processing/failed), mentioned to the instructor */
  hiddenCount?: number;
  className?: string;
}) {
  const total = lessons.reduce((s, l) => s + (l.duration ?? 0), 0);
  const index = lessons.findIndex((l) => l.id === activeId);
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-white/[0.08] bg-card/50', className)} aria-label="Course content">
      <header className="border-b border-white/[0.06] px-4 py-3.5">
        <h3 className="font-semibold">Course content</h3>
        <p className="text-xs text-muted-foreground">
          {index >= 0 ? `Lesson ${index + 1} of ${lessons.length}` : pluralize(lessons.length, 'lesson')}
          {total ? ` · ${courseLength(total)}` : ''}
        </p>
      </header>
      <ol className="max-h-[min(60vh,560px)] overflow-y-auto p-1.5">
        {lessons.map((lesson, i) => {
          const active = lesson.id === activeId;
          const watched = watchedFraction(progress[lesson.id]);
          const done = Boolean(progress[lesson.id]?.completed);
          return (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => onSelect(lesson)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
                  active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                )}
              >
                <span className="grid w-5 shrink-0 place-items-center text-xs tabular-nums text-muted-foreground">
                  {active ? <NowPlaying /> : i + 1}
                </span>
                <LessonThumbnail video={lesson} className="aspect-video w-28 shrink-0 rounded-lg ring-1 ring-white/10">
                  {lesson.duration ? (
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-px text-[10px] font-semibold tabular-nums text-white">
                      {lessonLength(lesson.duration)}
                    </span>
                  ) : null}
                  {watched > 0 ? (
                    <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                      <span className="block h-full bg-primary" style={{ width: `${watched * 100}%` }} />
                    </span>
                  ) : null}
                </LessonThumbnail>
                <span className="min-w-0 flex-1">
                  <span className={cn('line-clamp-2 text-sm', active ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                    {lesson.title}
                  </span>
                  {done ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Watched
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {hiddenCount > 0 ? (
        <p className="border-t border-white/[0.06] px-4 py-2.5 text-xs text-muted-foreground">
          {pluralize(hiddenCount, 'lesson')} still processing or failed — students only see ready lessons.
        </p>
      ) : null}
    </section>
  );
}
