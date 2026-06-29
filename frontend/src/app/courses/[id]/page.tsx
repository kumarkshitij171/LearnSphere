'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Loader2,
  Lock,
  Play,
  Pause,
  CheckCircle2,
  ChevronRight,
  Share2,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppShell } from '@/components/app-shell';
import { HlsPlayer } from '@/lib/player';
import { masterPlaylistUrl } from '@/lib/playback';
import { cn } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { coursesApi, getApiErrorMessage, type CourseDetail, type CourseVideo } from '@/lib/api';

const SUITABLE_FOR = [
  'Anyone who wants to start their career & get paid for their skills.',
  'Beginners, newbies & amateurs in the field.',
  'For anyone that needs to add this topic to their portfolio.',
  'Aimed at people new to the subject.',
];

const POINTS = [25, 50, 75, 100];

function fmtDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hour ${rem} min` : `${h} hour`;
}

function LessonRow({
  video,
  index,
  active,
  completed,
  onSelect,
}: {
  video: CourseVideo;
  index: number;
  active: boolean;
  completed: boolean;
  onSelect: (v: CourseVideo) => void;
}) {
  const ready = video.status === 'READY';
  return (
    <button
      disabled={!ready}
      onClick={() => onSelect(video)}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-white/10 hover:border-white/25',
        !ready && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full',
          active ? 'bg-white/20 text-primary-foreground' : 'bg-white/5 text-foreground'
        )}
      >
        {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{video.title}</span>
        <span
          className={cn(
            'block text-xs',
            active ? 'text-primary-foreground/80' : 'text-muted-foreground'
          )}
        >
          {ready ? fmtDuration(video.duration) : video.status.toLowerCase()}
        </span>
      </span>
      {completed && !active ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
      ) : (
        <span
          className={cn(
            'shrink-0 text-xs',
            active ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
    </button>
  );
}

export default function CourseDetailPage() {
  const { user, checking } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<CourseVideo | null>(null);
  const [showFullAbout, setShowFullAbout] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await coursesApi.getById(courseId);
      setCourse(c);
      setActive((prev) => prev ?? c.videos.find((v) => v.status === 'READY') ?? c.videos[0] ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the course.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const enroll = async () => {
    setEnrolling(true);
    setError(null);
    try {
      await coursesApi.enroll(courseId);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not enroll.'));
    } finally {
      setEnrolling(false);
    }
  };

  const activeIndex = useMemo(
    () => (course && active ? course.videos.findIndex((v) => v.id === active.id) : -1),
    [course, active]
  );
  // Visual-only progress: lessons before the active one read as completed.
  const completedCount = activeIndex > 0 ? activeIndex : 0;
  const total = course?.videos.length ?? 0;
  const progressPct = total ? Math.round((completedCount / total) * 100) : 0;

  if (checking || !user || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  if (!course) {
    return (
      <AppShell user={user}>
        <div className="px-6 py-16 text-center text-muted-foreground">{error || 'Course not found.'}</div>
      </AppShell>
    );
  }

  const aboutLong = course.description.length > 260;
  const aboutText =
    showFullAbout || !aboutLong ? course.description : `${course.description.slice(0, 260)}…`;

  return (
    <AppShell user={user}>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left / main column */}
        <div className="min-w-0 space-y-5">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">My Courses</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="max-w-[200px] truncate text-foreground/80">{course.title}</span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">Course</span>
          </nav>

          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{course.title}</h1>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!course.canAccessVideos ? (
            <Card className="glass border-white/10">
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Enroll to watch this course.</p>
                <Button onClick={enroll} disabled={enrolling} className="gap-2">
                  {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {course.price > 0 ? `Enroll · $${course.price}` : 'Enroll for free'}
                </Button>
              </CardContent>
            </Card>
          ) : active ? (
            <HlsPlayer
              src={masterPlaylistUrl(active)}
              className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
            />
          ) : (
            <Card className="glass border-white/10">
              <CardContent className="py-16 text-center text-muted-foreground">
                No videos are ready to watch yet.
              </CardContent>
            </Card>
          )}

          {/* Instructor */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-sm font-bold text-[#0A0A0F]">
                {(course.instructor?.name || 'In').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="font-semibold">{course.instructor?.name || 'Instructor'}</p>
                <p className="text-xs text-muted-foreground">Mentor · Course Instructor</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground" title="Share">
                <Share2 className="h-4 w-4" />
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground" title="Save">
                <Bookmark className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* About */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">About This Course</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{aboutText}</p>
            {aboutLong && (
              <button
                onClick={() => setShowFullAbout((s) => !s)}
                className="mt-2 text-sm font-medium text-primary hover:underline"
              >
                {showFullAbout ? 'Show less' : 'Show more'}
              </button>
            )}
          </section>

          {/* Suitable for */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">This Course Suit For:</h2>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {SUITABLE_FOR.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          {/* Study progress (visual) */}
          <Card className="glass border-white/10">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Your Study Progress</h3>
                <span className="text-sm font-semibold text-primary">{progressPct}%</span>
              </div>
              <div className="relative">
                <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/10" />
                <div
                  className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
                <div className="relative flex justify-between">
                  {POINTS.map((p, i) => {
                    const reached = progressPct >= (i / (POINTS.length - 1)) * 100;
                    return (
                      <div key={p} className="flex flex-col items-center gap-1.5">
                        <span
                          className={cn(
                            'h-3 w-3 rounded-full ring-4 ring-background',
                            reached ? 'bg-primary' : 'bg-white/20'
                          )}
                        />
                        <span className="text-[11px] text-muted-foreground">{p} Points</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="rounded-lg bg-white/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">
                Great job! 🎉 You&apos;re on the path to mastering <b>{course.title}</b>. Keep going —
                finish strong!
              </p>
            </CardContent>
          </Card>

          {/* Course completion + lessons */}
          <div>
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-semibold">Course Completion</h3>
              <span className="text-sm text-muted-foreground">
                {completedCount}/{total}
              </span>
            </div>
            <div className="space-y-2">
              {course.videos.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">No lessons yet.</p>
              ) : (
                course.videos.map((v, i) => (
                  <LessonRow
                    key={v.id}
                    video={v}
                    index={i}
                    active={active?.id === v.id}
                    completed={i < completedCount}
                    onSelect={setActive}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
