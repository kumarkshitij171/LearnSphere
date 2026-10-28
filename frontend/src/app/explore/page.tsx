'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, Search, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCard, CourseGrid } from '@/components/course-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { coursesApi, type CourseSummary } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { matchesQuery } from '@/lib/search';
import { cn } from '@/lib/utils';

type PriceFilter = 'all' | 'free' | 'paid';
type Sort = 'newest' | 'price-asc' | 'price-desc';

function ExplorePage() {
  const { user, checking } = useRequireAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [price, setPrice] = useState<PriceFilter>('all');
  const [sort, setSort] = useState<Sort>('newest');

  // the top bar's search lands here as ?q=
  useEffect(() => setQuery(params.get('q') ?? ''), [params]);

  useEffect(() => {
    if (!user) return;
    coursesApi.list().then(setCourses).catch(() => setCourses([]));
    coursesApi
      .enrolled()
      .then((list) => setOwned(new Set(list.map((c) => c.id))))
      .catch(() => undefined);
  }, [user]);

  const results = useMemo(() => {
    const list = (courses ?? [])
      .filter((c) => matchesQuery(c, query))
      .filter((c) => (price === 'all' ? true : price === 'free' ? !c.price : c.price > 0));
    return [...list].sort((a, b) =>
      sort === 'price-asc' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : b.createdAt.localeCompare(a.createdAt)
    );
  }, [courses, query, price, sort]);

  const updateQuery = (q: string) => {
    setQuery(q);
    router.replace(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore', { scroll: false });
  };

  if (checking || !user) return <main className="min-h-screen bg-background" />;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1200px] space-y-6 px-4 pb-16 pt-8 sm:px-6 lg:px-9">
        <PageHeader
          title="Explore courses"
          description={courses ? `${pluralize(courses.length, 'course')} to learn from, made by instructors on LearnSphere.` : ' '}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder="Search by title, topic or instructor"
              aria-label="Search courses"
              className="h-10 w-full rounded-[10px] border border-transparent bg-surface pl-10 pr-10 text-sm placeholder:text-subtle hover:bg-foreground/[0.06] focus-visible:border-foreground/25 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => updateQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Price" className="inline-flex rounded-full bg-surface p-1">
              {(['all', 'free', 'paid'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={price === p}
                  onClick={() => setPrice(p)}
                  className={cn(
                    'h-8 rounded-full px-3.5 text-[13px] font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
                    price === p
                      ? 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)),0_1px_2px_rgb(17_17_19/0.06)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort"
              className="h-10 rounded-[10px] border border-transparent bg-surface px-3 text-sm text-foreground hover:bg-foreground/[0.06] focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10"
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </div>
        </div>

        {courses === null ? (
          <CourseGrid>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-[12px]" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </CourseGrid>
        ) : results.length ? (
          <CourseGrid>
            {results.map((c) => (
              <CourseCard key={c.id} course={c} href={`/courses/${c.id}`} owned={owned.has(c.id)} />
            ))}
          </CourseGrid>
        ) : (
          <EmptyState
            icon={<Compass />}
            title={query ? `No courses match “${query}”` : 'No courses yet'}
            description={query ? 'Try fewer or different words.' : 'Published courses will appear here.'}
          />
        )}
      </div>
    </AppShell>
  );
}

export default function Explore() {
  return (
    <Suspense fallback={null}>
      <ExplorePage />
    </Suspense>
  );
}
