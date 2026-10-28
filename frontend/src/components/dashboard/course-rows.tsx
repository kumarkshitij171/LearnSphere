'use client';

import Link from 'next/link';
import { CourseCover } from '@/components/course-cover';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { CourseSummary } from '@/lib/api';
import { pluralize, relativeTime } from '@/lib/format';

export interface LearningRow {
  course: CourseSummary;
  done: number;
  total: number;
  /** ms since epoch of the last watched lesson in this course; null = not started */
  lastWatched: number | null;
  /** the most recent unfinished lesson, to land on it */
  resumeLessonId: string | null;
}

/** Enrolled courses as scannable rows: one thin bar, "3 of 12 lessons", last watched, Continue. */
export function CourseRows({ rows }: { rows: LearningRow[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
      {rows.map((r) => {
        const href = `/courses/${r.course.id}${r.resumeLessonId ? `?lesson=${r.resumeLessonId}` : ''}`;
        const finished = r.total > 0 && r.done >= r.total;
        return (
          <li key={r.course.id}>
            <Link
              href={href}
              className="group grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-3 py-3 outline-none transition-colors hover:bg-surface/60 focus-visible:bg-surface sm:grid-cols-[112px_minmax(0,1fr)_minmax(140px,200px)_110px_auto] sm:px-4"
            >
              <CourseCover id={r.course.id} title={r.course.title} thumbnail={r.course.thumbnail} coverVideoId={r.course.coverVideoId} size="sm" className="aspect-video w-full rounded-[7px]" />
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{r.course.title}</h3>
                <p className="truncate text-[13px] text-muted-foreground">
                  {[r.course.instructor?.name, pluralize(r.total, 'lesson')].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <ProgressBar value={r.total ? r.done / r.total : 0} label={`${r.course.title} progress`} />
                <p className="text-[12.5px] text-body">
                  {finished ? <span className="text-success">Completed</span> : r.done ? `${r.done} of ${r.total} lessons` : 'Not started'}
                </p>
              </div>
              <span className="hidden text-[13px] text-muted-foreground sm:block">
                {r.lastWatched ? relativeTime(new Date(r.lastWatched).toISOString()) : '—'}
              </span>
              <span className="hidden h-8 items-center justify-self-end rounded-full border border-border px-3.5 text-[13px] font-medium transition-colors group-hover:border-foreground/25 sm:inline-flex">
                {finished ? 'Review' : r.done ? 'Continue' : 'Start'}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
