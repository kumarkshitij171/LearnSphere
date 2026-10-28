'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import { formatTime } from '@/components/player/time';
import { Skeleton } from '@/components/ui/skeleton';
import { coursesApi, type CourseDetail } from '@/lib/api';
import type { LessonProgress } from '@/lib/progress';

/** The one primary action on the dashboard: back into the last unfinished lesson, at the second it stopped. */
export function ContinuePanel({ videoId, entry }: { videoId: string; entry: LessonProgress }) {
  const [course, setCourse] = useState<CourseDetail | null | undefined>(undefined);

  useEffect(() => {
    coursesApi.getById(entry.courseId).then(setCourse).catch(() => setCourse(null));
  }, [entry.courseId]);

  if (course === undefined) return <Skeleton className="h-[204px] w-full rounded-panel" />;
  const ready = course?.videos.filter((v) => v.status === 'READY') ?? [];
  const index = ready.findIndex((v) => v.id === videoId);
  const lesson = ready[index];
  if (!course || !lesson) return null;

  const fraction = entry.duration ? Math.min(1, entry.position / entry.duration) : 0;
  const left = Math.max(0, entry.duration - entry.position);

  return (
    <Link
      href={`/courses/${course.id}?lesson=${lesson.id}`}
      className="group grid gap-5 rounded-panel bg-surface p-3 outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/35 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-center sm:gap-6"
    >
      <LessonThumbnail video={lesson} className="aspect-video w-full rounded-[11px]">
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-background text-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)] transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <span className="block h-full bg-highlight" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
      </LessonThumbnail>
      <div className="min-w-0 space-y-2 pb-2 sm:pb-0 sm:pr-4">
        <p className="text-[13px] text-muted-foreground">
          Continue · Lesson {index + 1} of {ready.length}
        </p>
        <h2 className="line-clamp-2 text-title">{lesson.title}</h2>
        <p className="truncate text-sm text-body">
          {course.title}
          {course.instructor?.name ? ` · ${course.instructor.name}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/85">
            Resume at <span className="font-mono tabular-nums">{formatTime(entry.position)}</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatTime(left)} left</span>
        </div>
      </div>
    </Link>
  );
}
