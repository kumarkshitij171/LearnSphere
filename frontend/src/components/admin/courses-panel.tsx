'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, GraduationCap, Search, Settings2 } from 'lucide-react';
import { CourseCover } from '@/components/course-cover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApi, getApiErrorMessage, type CourseSummary } from '@/lib/api';
import { pluralize, relativeTime } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { matchesQuery } from '@/lib/search';

type Filter = 'all' | 'live' | 'draft';

/** Every course on the platform, drafts included — what support needs to look at a creator's work. */
export function CoursesPanel() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    adminApi
      .listCourses()
      .then(setCourses)
      .catch((e) => {
        setError(getApiErrorMessage(e, 'Could not load courses.'));
        setCourses([]);
      });
  }, []);

  const shown = useMemo(
    () =>
      (courses ?? [])
        .filter((c) => (filter === 'all' ? true : filter === 'live' ? c.isPublished : !c.isPublished))
        .filter((c) => matchesQuery(c, search)),
    [courses, filter, search]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or instructor"
            aria-label="Search courses"
            className="h-10 w-full rounded-xl border border-border bg-foreground/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </label>
        <div role="radiogroup" aria-label="Status" className="inline-flex rounded-xl bg-foreground/[0.03] p-1 ring-1 ring-foreground/10">
          {(['all', 'live', 'draft'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? 'rounded-lg bg-foreground/10 px-3 py-1.5 text-sm font-medium capitalize text-foreground'
                  : 'rounded-lg px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:text-foreground'
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {courses === null ? (
        <Skeleton className="h-64 w-full rounded-[14px]" />
      ) : error ? (
        <EmptyState icon={<GraduationCap />} title="Courses are unavailable" description={error} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title="No courses match" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-foreground/[0.02]">
              <CourseCover id={c.id} title={c.title} thumbnail={c.thumbnail} coverVideoId={c.coverVideoId} size="sm" className="aspect-video w-24 shrink-0 rounded-lg ring-1 ring-foreground/10" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {c.title}
                  <Badge tone={c.isPublished ? 'success' : 'warning'} dot>
                    {c.isPublished ? 'Live' : 'Draft'}
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.instructor?.name ?? 'Unknown instructor'} · {pluralize(c._count?.videos ?? 0, 'lesson')} ·{' '}
                  {pluralize(c._count?.enrollments ?? 0, 'student')} · {formatPrice(c.price, c.currency)} · created {relativeTime(c.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <Link href={`/courses/${c.id}`}>
                    <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">View</span>
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href={`/courses/${c.id}/manage`}>
                    <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Studio</span>
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
