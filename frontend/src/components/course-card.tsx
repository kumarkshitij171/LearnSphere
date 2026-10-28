'use client';

import Link from 'next/link';
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
      className="group flex h-full flex-col gap-3 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <CourseCover
        id={course.id}
        title={course.title}
        thumbnail={course.thumbnail}
        coverVideoId={course.coverVideoId}
        className="aspect-video w-full rounded-[12px] ring-1 ring-inset ring-foreground/[0.06] transition-shadow group-hover:ring-foreground/20"
      >
        {variant === 'studio' ? (
          <span className="absolute left-2.5 top-2.5">
            <Badge tone={course.isPublished ? 'success' : 'warning'} dot className="bg-background/95">
              {course.isPublished ? 'Live' : 'Draft'}
            </Badge>
          </span>
        ) : null}
        {variant === 'learning' && progress !== undefined ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
            <span className="block h-full bg-highlight" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : null}
      </CourseCover>

      <div className="flex flex-1 flex-col gap-1 px-0.5">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{course.title}</h3>
        {variant === 'studio' ? (
          <p className="line-clamp-1 text-[13px] text-muted-foreground">{course.description || 'No description yet'}</p>
        ) : course.instructor?.name ? (
          <p className="truncate text-[13px] text-muted-foreground">{course.instructor.name}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-[13px] text-body">
          <span>
            {pluralize(lessons, 'lesson')}
            {variant === 'studio' && students != null ? ` · ${pluralize(students, 'student')}` : null}
          </span>
          {variant === 'learning' && progress !== undefined ? (
            <span className={cn('font-medium tabular-nums', progress >= 1 ? 'text-success' : 'text-foreground')}>
              {progress >= 1 ? 'Completed' : `${Math.round(progress * 100)}%`}
            </span>
          ) : variant === 'catalogue' && owned ? (
            <Badge tone="success">Owned</Badge>
          ) : (
            <span className="font-mono font-medium tabular-nums text-foreground">{formatPrice(course.price, course.currency)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** The grid every course list uses. */
export function CourseGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>{children}</div>;
}
