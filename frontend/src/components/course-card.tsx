'use client';

import Link from 'next/link';
import { Layers, PlayCircle, Users } from 'lucide-react';
import { CourseCover } from '@/components/course-cover';
import { Badge } from '@/components/ui/badge';
import type { CourseSummary } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { cn } from '@/lib/utils';

export type CourseCardVariant = 'catalogue' | 'learning' | 'studio';

export function CourseCard({
  course,
  href,
  variant = 'catalogue',
  owned,
  progress,
}: {
  course: CourseSummary;
  href: string;
  variant?: CourseCardVariant;
  /** catalogue: the viewer already has this course */
  owned?: boolean;
  /** learning: 0..1, lessons watched */
  progress?: number;
}) {
  const lessons = course._count?.videos ?? 0;
  const students = course._count?.enrollments;
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-card/50 outline-none transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] focus-visible:ring-2 focus-visible:ring-primary"
    >
      <CourseCover id={course.id} title={course.title} className="aspect-video w-full">
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          {variant === 'studio' ? (
            <Badge tone={course.isPublished ? 'success' : 'warning'} dot className="bg-black/55 backdrop-blur">
              {course.isPublished ? 'Live' : 'Draft'}
            </Badge>
          ) : variant === 'catalogue' ? (
            owned ? (
              <Badge tone="success" className="bg-black/55 backdrop-blur">Owned</Badge>
            ) : (
              <Badge tone={course.price ? 'neutral' : 'primary'} className="bg-black/55 text-white backdrop-blur">
                {formatPrice(course.price, course.currency)}
              </Badge>
            )
          ) : (
            <span />
          )}
        </div>
        <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur">
            <PlayCircle className="h-6 w-6" />
          </span>
        </span>
        {variant === 'learning' && progress !== undefined ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <span className="block h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : null}
      </CourseCover>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">{course.title}</h3>
        {course.instructor?.name && variant !== 'studio' ? (
          <p className="truncate text-sm text-muted-foreground">{course.instructor.name}</p>
        ) : variant === 'studio' ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> {pluralize(lessons, 'lesson')}
          </span>
          {variant === 'studio' && students != null ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {pluralize(students, 'student')}
            </span>
          ) : variant === 'learning' && progress !== undefined ? (
            <span className={cn('font-medium tabular-nums', progress >= 1 ? 'text-emerald-300' : 'text-foreground/80')}>
              {progress >= 1 ? 'Completed' : `${Math.round(progress * 100)}% complete`}
            </span>
          ) : variant === 'studio' ? (
            <span className="font-medium text-foreground/80">{formatPrice(course.price, course.currency)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** The grid every course list uses. */
export function CourseGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}
