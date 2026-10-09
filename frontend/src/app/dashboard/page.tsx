'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, GraduationCap, Loader2, Play, Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCard, CourseGrid } from '@/components/course-card';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import { formatTime } from '@/components/player/time';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useUiConfig } from '@/lib/ui-config';
import {
  coursesApi,
  getApiErrorMessage,
  instructorApi,
  type CourseDetail,
  type CourseSummary,
  type CourseVideo,
  type CurrentUser,
  type InstructorRequest,
} from '@/lib/api';
import { lastUnfinished, loadProgress, type LessonProgress, type ProgressMap } from '@/lib/progress';

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          {linkLabel ?? 'See all'} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function courseProgress(course: CourseSummary, progress: ProgressMap): number {
  const total = course._count?.videos ?? 0;
  if (!total) return 0;
  const done = Object.values(progress).filter((p) => p.courseId === course.id && p.completed).length;
  return Math.min(1, done / total);
}

export default function HomePage() {
  const { user, checking } = useRequireAuth();
  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
  const teaches = user.role === 'INSTRUCTOR' || user.role === 'ADMIN';

  useEffect(() => {
    setProgress(loadProgress(user.id));
    coursesApi.list().then(setCatalogue).catch(() => setCatalogue([]));
    coursesApi.enrolled().then(setEnrolled).catch(() => setEnrolled([]));
    if (teaches) coursesApi.mine().then(setMine).catch(() => setMine([]));
  }, [user.id, teaches]);

  const firstName = (user.name?.trim().split(/\s+/)[0] || 'there').replace(/^./, (c) => c.toUpperCase());
  const owned = new Set((enrolled ?? []).map((c) => c.id));
  const fresh = (catalogue ?? []).filter((c) => !owned.has(c.id) && c.instructorId !== user.id).slice(0, 4);
  const resume = lastUnfinished(progress);

  return (
    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting()}, <span className="text-gradient">{firstName}</span>
        </h1>
        <p className="text-muted-foreground">
          {resume ? 'Pick up where you left off.' : enrolled?.length ? 'Ready for your next lesson?' : 'Find something new to learn today.'}
        </p>
      </header>

      {resume ? <ContinueWatching videoId={resume.videoId} entry={resume.entry} /> : null}

      <section>
        <SectionHeader title="My learning" href={enrolled?.length ? '/explore' : undefined} linkLabel="Find more courses" />
        {enrolled === null ? (
          <CourseGrid>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
            ))}
          </CourseGrid>
        ) : enrolled.length ? (
          <CourseGrid>
            {enrolled.map((c) => (
              <CourseCard key={c.id} course={c} href={`/courses/${c.id}`} variant="learning" progress={courseProgress(c, progress)} />
            ))}
          </CourseGrid>
        ) : (
          <EmptyState
            icon={<Compass />}
            title="You haven't started a course yet"
            description="Browse the catalogue and pick something you want to get better at."
            action={
              <Button asChild className="gap-2">
                <Link href="/explore">
                  <Compass className="h-4 w-4" /> Explore courses
                </Link>
              </Button>
            }
          />
        )}
      </section>

      {teaches ? (
        <section>
          <SectionHeader title="Your studio" href="/studio" linkLabel="Open studio" />
          {mine === null ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : mine.length ? (
            <CourseGrid>
              {mine.slice(0, 3).map((c) => (
                <CourseCard key={c.id} course={c} href={`/courses/${c.id}/manage`} variant="studio" />
              ))}
              <Link
                href="/courses/new"
                className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.03] hover:text-foreground"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.05] ring-1 ring-white/10">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Create a course</span>
              </Link>
            </CourseGrid>
          ) : (
            <EmptyState
              icon={<GraduationCap />}
              title="Create your first course"
              description="Give it a title and a price, then add lessons."
              action={
                <Button asChild className="gap-2">
                  <Link href="/courses/new">
                    <Plus className="h-4 w-4" /> Create course
                  </Link>
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
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : fresh.length ? (
          <CourseGrid>
            {fresh.map((c) => (
              <CourseCard key={c.id} course={c} href={`/courses/${c.id}`} />
            ))}
          </CourseGrid>
        ) : (
          <p className="text-sm text-muted-foreground">{catalogue.length ? "You've got everything in the catalogue — nice." : copy.emptyCatalogue}</p>
        )}
      </section>
    </div>
  );
}

function ContinueWatching({ videoId, entry }: { videoId: string; entry: LessonProgress }) {
  const [course, setCourse] = useState<CourseDetail | null>(null);
  useEffect(() => {
    coursesApi.getById(entry.courseId).then(setCourse).catch(() => setCourse(null));
  }, [entry.courseId]);
  const lesson: CourseVideo | undefined = course?.videos.find((v) => v.id === videoId && v.status === 'READY');
  if (!course || !lesson) return null;
  const index = course.videos.filter((v) => v.status === 'READY').findIndex((v) => v.id === lesson.id);
  const fraction = entry.duration ? entry.position / entry.duration : 0;

  return (
    <Link
      href={`/courses/${course.id}?lesson=${lesson.id}`}
      className="group flex flex-col gap-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-primary/[0.07] via-card/60 to-card/40 p-4 outline-none transition hover:border-white/20 focus-visible:ring-2 focus-visible:ring-primary sm:flex-row sm:items-center sm:p-5"
    >
      <LessonThumbnail video={lesson} className="aspect-video w-full shrink-0 rounded-2xl ring-1 ring-white/10 sm:w-80">
        <span className="absolute inset-0 grid place-items-center bg-black/20 transition-colors group-hover:bg-black/35">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur transition group-hover:scale-105">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <span className="block h-full bg-primary" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
      </LessonThumbnail>
      <div className="min-w-0 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Continue watching</p>
        <h2 className="line-clamp-2 font-display text-xl font-bold tracking-tight sm:text-2xl">{lesson.title}</h2>
        <p className="truncate text-sm text-muted-foreground">
          {course.title} · Lesson {index + 1}
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.55)]">
          <Play className="h-4 w-4 fill-current" /> Resume at {formatTime(entry.position)}
        </span>
      </div>
    </Link>
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
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-card/40 p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <GraduationCap className="h-6 w-6" />
        </span>
        <div className="flex-1 space-y-1">
          <h2 className="text-lg font-semibold">Teach on LearnSphere</h2>
          <p className="text-sm text-muted-foreground">
            {pending
              ? "Your request is with our team. We'll let you know as soon as it's reviewed."
              : request?.status === 'REJECTED'
                ? 'Your previous request was declined. You can apply again.'
                : 'Share what you know — create courses, upload lessons, and earn from every sale.'}
          </p>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>
        {pending ? (
          <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-amber-200 ring-1 ring-amber-400/20">Under review</span>
        ) : (
          <Button onClick={submit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Become an instructor
          </Button>
        )}
      </div>
    </section>
  );
}
