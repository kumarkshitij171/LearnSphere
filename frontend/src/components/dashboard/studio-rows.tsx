'use client';

import Link from 'next/link';
import { CourseCover } from '@/components/course-cover';
import { Badge } from '@/components/ui/badge';
import type { CourseSummary } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { formatPrice } from '@/lib/money';

/** An instructor's courses: status, lessons, students and price, each a link into its studio page. */
export function StudioRows({ courses }: { courses: CourseSummary[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
      {courses.map((c) => (
        <li key={c.id}>
          <Link
            href={`/courses/${c.id}/manage`}
            className="group grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 px-3 py-3 outline-none transition-colors hover:bg-surface/60 focus-visible:bg-surface sm:grid-cols-[112px_minmax(0,1fr)_90px_110px_100px_auto] sm:px-4"
          >
            <CourseCover id={c.id} title={c.title} thumbnail={c.thumbnail} coverVideoId={c.coverVideoId} size="sm" className="aspect-video w-full rounded-[7px]" />
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{c.title}</h3>
              <p className="truncate text-[13px] text-muted-foreground">
                {pluralize(c._count?.videos ?? 0, 'lesson')}
                <span className="sm:hidden"> · {pluralize(c._count?.enrollments ?? 0, 'student')}</span>
              </p>
            </div>
            <span className="justify-self-end sm:justify-self-start">
              <Badge tone={c.isPublished ? 'success' : 'warning'} dot>
                {c.isPublished ? 'Live' : 'Draft'}
              </Badge>
            </span>
            <span className="hidden text-[13px] text-body sm:block">{pluralize(c._count?.enrollments ?? 0, 'student')}</span>
            <span className="hidden font-mono text-[13px] tabular-nums sm:block">{formatPrice(c.price, c.currency)}</span>
            <span className="hidden h-8 items-center justify-self-end rounded-full border border-border px-3.5 text-[13px] font-medium transition-colors group-hover:border-foreground/25 sm:inline-flex">
              Manage
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
