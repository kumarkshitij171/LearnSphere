'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, GraduationCap, Loader2, Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCard, CourseGrid } from '@/components/course-card';
import { ContinuePanel } from '@/components/dashboard/continue-panel';
import { CourseRows, type LearningRow } from '@/components/dashboard/course-rows';
import { StudioRows } from '@/components/dashboard/studio-rows';
import { WeekPanel } from '@/components/dashboard/week-panel';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TwoTone } from '@/components/ui/two-tone';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useUiConfig } from '@/lib/ui-config';
import {
  coursesApi,
  getApiErrorMessage,
  instructorApi,
  type CourseSummary,
  type CurrentUser,
  type InstructorRequest,
} from '@/lib/api';
import { lastUnfinished, loadProgress, resumePosition, type ProgressMap } from '@/lib/progress';

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

function SectionHeader({ title, href, linkLabel, action }: { title: string; href?: string; linkLabel?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-heading">{title}</h2>
      {action ??
        (href ? (
          <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-body transition-colors hover:text-foreground">
            {linkLabel ?? 'See all'} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null)}
    </div>
  );
}

/** Per enrolled course: lessons watched out of ready lessons, when it was last watched, where to land. */
function learningRows(enrolled: CourseSummary[], progress: ProgressMap): LearningRow[] {
  return enrolled.map((course) => {
    const entries = Object.entries(progress).filter(([, p]) => p.courseId === course.id);
    const total = course._count?.videos ?? 0;
    const done = Math.min(total, entries.filter(([, p]) => p.completed).length);
    const lastWatched = entries.length ? Math.max(...entries.map(([, p]) => p.updatedAt)) : null;
    const resume = entries
      .filter(([, p]) => !p.completed && resumePosition(p) !== null)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
    return { course, done, total, lastWatched, resumeLessonId: resume?.[0] ?? null };
  });
}

export default function DashboardPage() {
  const { user, checking } = useRequireAuth();
  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  return (
    <AppShell user={user}>
      <Home user={user} />
    </AppShell>
  );
}

function Home({ user }: { user: CurrentUser }) {
  const { features, copy } = useUiConfig();
  const [catalogue, setCatalogue] = useState<CourseSummary[] | null>(null);
  const [enrolled, setEnrolled] = useState<CourseSummary[] | null>(null);
  const [mine, setMine] = useState<CourseSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const teaches = user.role === 'INSTRUCTOR' || user.role === 'ADMIN';

  useEffect(() => {
    setProgress(loadProgress(user.id));
    coursesApi.list().then(setCatalogue).catch(() => setCatalogue([]));
    coursesApi.enrolled().then(setEnrolled).catch(() => setEnrolled([]));
    if (teaches) coursesApi.mine().then(setMine).catch(() => setMine([]));
  }, [user.id, teaches]);

  const firstName = (user.name?.trim().split(/\s+/)[0] || 'there').replace(/^./, (c) => c.toUpperCase());
  const rows = useMemo(() => learningRows(enrolled ?? [], progress), [enrolled, progress]);
  const inProgress = rows
    .filter((r) => !(r.total > 0 && r.done >= r.total))
    .sort((a, b) => (b.lastWatched ?? 0) - (a.lastWatched ?? 0));
  const completed = rows.filter((r) => r.total > 0 && r.done >= r.total);
  const owned = new Set((enrolled ?? []).map((c) => c.id));
  const fresh = (catalogue ?? []).filter((c) => !owned.has(c.id) && c.instructorId !== user.id).slice(0, 4);
  const resume = lastUnfinished(progress);

  const trail =
    enrolled === null
      ? ' '
      : inProgress.length
        ? `${countWord(inProgress.length)} ${inProgress.length === 1 ? 'course' : 'courses'} in progress${resume ? ', one lesson half watched.' : '.'}`
        : resume
          ? 'Pick up where you left off.'
          : completed.length
          ? 'Everything you started is finished.'
          : 'Find something to learn today.';

  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 pb-16 pt-8 sm:px-6 lg:px-9">
      <TwoTone as="h1" lead={`${greeting()}, ${firstName}.`} trail={trail} breakLine className="text-display-m" />

      {features.studyProgress && resume ? (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ContinuePanel videoId={resume.videoId} entry={resume.entry} />
          <WeekPanel userId={user.id} />
        </div>
      ) : features.studyProgress ? (
        <WeekPanel userId={user.id} hideWhenEmpty className="lg:max-w-md" />
      ) : resume ? (
        <ContinuePanel videoId={resume.videoId} entry={resume.entry} />
      ) : null}

      <section>
        <SectionHeader title="In progress" href={enrolled?.length ? '/explore' : undefined} linkLabel="Find more courses" />
        {enrolled === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-[14px]" />
            ))}
          </div>
        ) : inProgress.length ? (
          <CourseRows rows={inProgress} />
        ) : (
          <EmptyState
            icon={<Compass />}
            title={completed.length ? 'Nothing in progress' : "You haven't started a course yet"}
            description={completed.length ? 'Pick your next course from the catalogue.' : 'Browse the catalogue and pick something you want to get better at.'}
            action={
              <Button asChild>
                <Link href="/explore">Explore courses</Link>
              </Button>
            }
          />
        )}
        {completed.length ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowCompleted((s) => !s)}
              className="rounded-md text-[13px] font-medium text-body transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-expanded={showCompleted}
            >
              {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
            </button>
            {showCompleted ? (
              <div className="mt-3">
                <CourseRows rows={completed} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {teaches ? (
        <section>
          <SectionHeader
            title="Your studio"
            action={
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/studio">Open studio</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/courses/new">
                    <Plus className="h-3.5 w-3.5" /> Create course
                  </Link>
                </Button>
              </div>
            }
          />
          {mine === null ? (
            <Skeleton className="h-[160px] w-full rounded-[14px]" />
          ) : mine.length ? (
            <StudioRows courses={mine.slice(0, 5)} />
          ) : (
            <EmptyState
              icon={<GraduationCap />}
              title="Create your first course"
              description="Give it a title and a price, then add lessons."
              action={
                <Button asChild>
                  <Link href="/courses/new">Create course</Link>
                </Button>
              }
            />
          )}
        </section>
      ) : null}

      {user.role === 'STUDENT' && features.instructorRequests ? <BecomeInstructor /> : null}

      <section>
        <SectionHeader title="New on LearnSphere" href="/explore" linkLabel="Explore all" />
        {catalogue === null ? (
          <CourseGrid>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-[12px]" />
            ))}
          </CourseGrid>
        ) : fresh.length ? (
          <CourseGrid>
            {fresh.map((c) => (
              <CourseCard key={c.id} course={c} href={`/courses/${c.id}`} />
            ))}
          </CourseGrid>
        ) : (
          <p className="text-sm text-muted-foreground">{catalogue.length ? 'You have every course in the catalogue.' : copy.emptyCatalogue}</p>
        )}
      </section>
    </div>
  );
}

function BecomeInstructor() {
  const [request, setRequest] = useState<InstructorRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    instructorApi.myRequest().then(setRequest).catch(() => setRequest(null)).finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await instructorApi.requestAccess();
      setRequest(data.request);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not submit request.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  const pending = request?.status === 'PENDING';

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-heading">Teach on LearnSphere</h2>
        <p className="max-w-prose text-sm text-body">
          {pending
            ? "Your request is with our team. We'll let you know as soon as it's reviewed."
            : request?.status === 'REJECTED'
              ? 'Your previous request was declined. You can apply again.'
              : 'Create courses, upload lessons and sell them here.'}
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      {pending ? (
        <span className="shrink-0 rounded-md bg-warning/10 px-2 py-1 text-[13px] font-medium text-warning">Under review</span>
      ) : (
        <Button onClick={submit} disabled={submitting} variant="outline" className="shrink-0">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Request instructor access
        </Button>
      )}
    </section>
  );
}
