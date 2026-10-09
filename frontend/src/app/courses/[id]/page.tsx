'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Clock, Film, Layers, Lock, Share2, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { BuyCourse } from '@/components/buy-course';
import { CourseCover } from '@/components/course-cover';
import { InstructorPreviewBar } from '@/components/course/instructor-preview-bar';
import { LessonPlaylist } from '@/components/course/lesson-playlist';
import { ProgressCard } from '@/components/course/progress-card';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import { VideoPlayer } from '@/components/player/video-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { coursesApi, getApiErrorMessage, type CourseDetail, type CourseVideo } from '@/lib/api';
import { courseLength, lessonLength, pluralize } from '@/lib/format';
import { formatPrice } from '@/lib/money';
import { masterPlaylistUrl } from '@/lib/playback';
import { loadProgress, recordProgress, resumePosition, type ProgressMap } from '@/lib/progress';
import { cn } from '@/lib/utils';

const THEATER_KEY = 'learnsphere.player.theater';

function readTheater(): boolean {
  try {
    return window.localStorage.getItem(THEATER_KEY) === '1';
  } catch {
    return false;
  }
}

function topQuality(lessons: CourseVideo[]): string | null {
  const heights = lessons.flatMap((l) => (l.resolutions ?? []).map((r) => Math.min(r.width, r.height)));
  if (!heights.length) return null;
  const max = Math.max(...heights);
  return max >= 2160 ? '4K' : `${max}p`;
}

function CoursePage() {
  const { user, checking } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const courseId = params.id;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [theater, setTheater] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => setTheater(readTheater()), []);
  useEffect(() => {
    if (user) setProgress(loadProgress(user.id));
  }, [user]);

  // returns the course too, so the buy flow can poll until enrolment shows up
  const reloadCourse = useCallback(async () => {
    const c = await coursesApi.getById(courseId);
    setCourse(c);
    return c;
  }, [courseId]);

  useEffect(() => {
    reloadCourse()
      .catch((e) => setError(getApiErrorMessage(e, 'Could not load the course.')))
      .finally(() => setLoading(false));
  }, [reloadCourse]);

  // students only ever see ready lessons; the instructor preview shows exactly the same
  const lessons = useMemo(() => course?.videos.filter((v) => v.status === 'READY') ?? [], [course]);
  const hiddenCount = (course?.videos.length ?? 0) - lessons.length;
  const canManage = Boolean(course && user && (course.instructorId === user.id || user.role === 'ADMIN'));

  // initial lesson: the one in ?lesson=, else the first unfinished one, else the first
  useEffect(() => {
    if (!lessons.length || activeId) return;
    const wanted = searchParams.get('lesson');
    const fromUrl = wanted ? lessons.find((l) => l.id === wanted) : undefined;
    const unfinished = lessons.find((l) => !progress[l.id]?.completed);
    setActiveId((fromUrl ?? unfinished ?? lessons[0])!.id);
  }, [lessons, activeId, searchParams, progress]);

  const active = lessons.find((l) => l.id === activeId) ?? null;
  const activeIndex = active ? lessons.indexOf(active) : -1;

  const select = useCallback(
    (lesson: CourseVideo) => {
      setActiveId(lesson.id);
      router.replace(`/courses/${courseId}?lesson=${lesson.id}`, { scroll: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [courseId, router]
  );

  const neighbour = (i: number) => {
    const l = lessons[i];
    return l
      ? {
          title: l.title,
          onPlay: () => select(l),
          thumbnail: <LessonThumbnail video={l} className="h-full w-full" />,
        }
      : null;
  };

  const toggleTheater = (on: boolean) => {
    setTheater(on);
    try {
      window.localStorage.setItem(THEATER_KEY, on ? '1' : '0');
    } catch {
      // a preference, not state
    }
  };

  const onProgress = useCallback(
    (position: number, duration: number, ended: boolean) => {
      if (!user || !active) return;
      setProgress(recordProgress(user.id, courseId, active.id, position, duration, ended));
    },
    [user, active, courseId]
  );

  const share = async () => {
    const url = `${window.location.origin}/courses/${courseId}`;
    try {
      if (navigator.share) await navigator.share({ title: course?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // the share sheet was dismissed
    }
  };

  if (checking || !user || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <AppShell user={user}>
        <div className="mx-auto max-w-xl px-4 py-20">
          <EmptyState
            icon={<Film />}
            title="This course isn't available"
            description={error ?? 'It may have been unpublished or removed.'}
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard">Browse courses</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const totalLength = lessons.reduce((s, l) => s + (l.duration ?? 0), 0);
  const curriculum = course.curriculum ?? [];
  const quality = topQuality(lessons);
  const aboutLong = course.description.length > 280;

  const player = active ? (
    <VideoPlayer
      key={active.id}
      src={masterPlaylistUrl(active)}
      title={active.title}
      previous={neighbour(activeIndex - 1)}
      next={neighbour(activeIndex + 1)}
      theater={theater}
      onTheaterChange={toggleTheater}
      shortcuts="global"
      autoPlay={Boolean(searchParams.get('lesson'))}
      startAt={resumePosition(progress[active.id])}
      onProgress={onProgress}
      maxHeightVh={theater ? 82 : 72}
    />
  ) : null;

  const lockedHero = (
    <CourseCover id={course.id} title={course.title} size="lg" className="aspect-video w-full rounded-2xl ring-1 ring-white/10">
      <div className="absolute inset-0 grid place-items-center bg-black/45">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/60 ring-1 ring-white/20 backdrop-blur">
            <Lock className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-white/90">
            {curriculum.length ? `${pluralize(curriculum.length, 'lesson')} waiting for you` : 'Lessons are on the way'}
          </p>
        </div>
      </div>
    </CourseCover>
  );

  const purchase = (
    <Suspense fallback={null}>
      <BuyCourse course={course} reloadCourse={reloadCourse} />
    </Suspense>
  );

  const details = (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[1.75rem]">
          {active && course.canAccessVideos ? active.title : course.title}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-sm font-bold text-[#0A0A0F]">
              {(course.instructor?.name || 'In').slice(0, 2).toUpperCase()}
            </span>
            <div className="leading-tight">
              <p className="font-semibold">{course.instructor?.name || 'Instructor'}</p>
              <p className="text-xs text-muted-foreground">
                {active && course.canAccessVideos ? (
                  <>
                    {course.title} · Lesson {activeIndex + 1} of {lessons.length}
                  </>
                ) : (
                  'Instructor'
                )}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={share} className="gap-2">
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-card/40 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={course.canAccessVideos ? 'success' : 'primary'}>
            {course.canAccessVideos ? (canManage ? 'Your course' : 'Owned') : formatPrice(course.price, course.currency)}
          </Badge>
          <Badge>
            <Layers className="h-3 w-3" /> {pluralize(course.canAccessVideos ? lessons.length : curriculum.length, 'lesson')}
          </Badge>
          {totalLength || curriculum.some((c) => c.duration) ? (
            <Badge>
              <Clock className="h-3 w-3" />
              {courseLength(totalLength || curriculum.reduce((s, c) => s + (c.duration ?? 0), 0))}
            </Badge>
          ) : null}
          {quality ? (
            <Badge>
              <Sparkles className="h-3 w-3" /> Up to {quality}
            </Badge>
          ) : null}
        </div>
        <h2 className="pt-1 font-semibold">About this course</h2>
        <p className={cn('whitespace-pre-line text-sm leading-relaxed text-muted-foreground', !aboutOpen && aboutLong && 'line-clamp-4')}>
          {course.description}
        </p>
        {aboutLong ? (
          <button type="button" onClick={() => setAboutOpen((o) => !o)} className="text-sm font-medium text-primary hover:underline">
            {aboutOpen ? 'Show less' : 'Show more'}
          </button>
        ) : null}
      </section>

      {!course.canAccessVideos && curriculum.length ? (
        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card/40">
          <h2 className="border-b border-white/[0.06] px-5 py-3.5 font-semibold">What you&apos;ll watch</h2>
          <ol className="divide-y divide-white/[0.05]">
            {curriculum.map((c, i) => (
              <li key={`${i}-${c.title}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <Lock className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="flex-1 truncate">{c.title}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{lessonLength(c.duration)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );

  const rail = course.canAccessVideos ? (
    <div className="space-y-4">
      <ProgressCard lessons={lessons} progress={progress} activeId={activeId} onPlay={select} />
      {lessons.length ? (
        <LessonPlaylist lessons={lessons} activeId={activeId} progress={progress} onSelect={select} hiddenCount={canManage ? hiddenCount : 0} />
      ) : null}
    </div>
  ) : (
    purchase
  );

  const noLessons = course.canAccessVideos && lessons.length === 0 && (
    <EmptyState
      icon={<Film />}
      title="No lessons to watch yet"
      description={canManage ? 'Add a lesson in the studio — it appears here once it has finished processing.' : 'The instructor is still preparing this course. Check back soon.'}
      action={
        canManage ? (
          <Button asChild>
            <Link href={`/courses/${course.id}/manage`}>Open studio</Link>
          </Button>
        ) : undefined
      }
      className="aspect-video justify-center"
    />
  );

  return (
    <AppShell user={user}>
      {canManage ? <InstructorPreviewBar courseId={course.id} published={course.isPublished} /> : null}
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-foreground/80">{course.title}</span>
        </nav>

        {theater && course.canAccessVideos ? (
          <div className="space-y-6">
            <div className="-mx-4 bg-black sm:-mx-6 lg:-mx-8">{player}</div>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              {details}
              {rail}
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0 space-y-6">
              {course.canAccessVideos ? player ?? noLessons : lockedHero}
              {details}
            </div>
            <aside className="space-y-4 lg:sticky lg:top-20">{rail}</aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function CourseDetailPage() {
  // useSearchParams needs a Suspense boundary under the App Router
  return (
    <Suspense fallback={null}>
      <CoursePage />
    </Suspense>
  );
}
