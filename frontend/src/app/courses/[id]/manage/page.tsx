'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Globe, Loader2, MoreHorizontal, Pencil, Plus, Trash2, UploadCloud, Video } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCover } from '@/components/course-cover';
import { AddLessonDialog } from '@/components/studio/add-lesson-dialog';
import { EditCourseDialog } from '@/components/studio/edit-course-dialog';
import { EditLessonDialog } from '@/components/studio/edit-lesson-dialog';
import { LessonRow, type LessonActions } from '@/components/studio/lesson-row';
import { PublishChecklist, publishChecklist } from '@/components/studio/publish-checklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { coursesApi, getApiErrorMessage, videosApi, type CourseDetail, type CourseVideo } from '@/lib/api';
import { courseLength, pluralize } from '@/lib/format';
import { failureCopy, isProcessing } from '@/lib/lesson-status';
import { formatPrice } from '@/lib/money';

const POLL_MS = 5000;

export default function CourseStudioPage() {
  const { user, checking } = useRequireRole(['INSTRUCTOR', 'ADMIN']);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const courseId = params.id;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<CourseVideo | null>(null);
  const [replacing, setReplacing] = useState<CourseVideo | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // last seen status per lesson, so a poll can announce what changed
  const seen = useRef<Map<string, CourseVideo['status']>>(new Map());

  const load = useCallback(async () => {
    try {
      const next = await coursesApi.getById(courseId);
      for (const v of next.videos) {
        const before = seen.current.get(v.id);
        if (before && before !== v.status) {
          if (v.status === 'READY') {
            toast.success(`“${v.title}” is ready to watch`, {
              action: { label: 'Preview', onClick: () => router.push(`/courses/${courseId}?lesson=${v.id}`) },
            });
          } else if (v.status === 'FAILED') {
            toast.error(`Couldn't process “${v.title}”`, {
              description: failureCopy(v).message,
              duration: Infinity,
              action: {
                label: 'Replace',
                onClick: () => {
                  setReplacing(v);
                  setAddOpen(true);
                },
              },
            });
          }
        }
        seen.current.set(v.id, v.status);
      }
      setCourse(next);
      setLoadError(null);
      return next;
    } catch (e) {
      setLoadError(getApiErrorMessage(e, 'Could not load this course.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const anyProcessing = course?.videos.some(isProcessing) ?? false;
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  if (checking || !user || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-44 w-full rounded-panel" />
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-[14px]" />
              <Skeleton className="h-24 w-full rounded-[14px]" />
            </div>
            <Skeleton className="h-56 w-full rounded-[14px]" />
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
            icon={<Video />}
            title="Course not available"
            description={loadError ?? 'It may have been deleted.'}
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard">Back to your courses</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  const ready = course.videos.filter((v) => v.status === 'READY');
  const totalLength = ready.reduce((sum, v) => sum + (v.duration ?? 0), 0);
  const checklist = publishChecklist(course);
  const canPublish = checklist.every((i) => i.done || !i.required);

  const setPublished = async (publish: boolean) => {
    const ok = await confirm(
      publish
        ? {
            title: 'Publish this course?',
            description: 'It will appear in the catalogue, and students can enrol or buy it straight away.',
            confirmLabel: 'Publish',
          }
        : {
            title: 'Unpublish this course?',
            description: "New students won't be able to find it. Students who already have it keep their access.",
            confirmLabel: 'Unpublish',
          }
    );
    if (!ok) return;
    setPublishing(true);
    try {
      await coursesApi.update(course.id, { isPublished: publish });
      await load();
      toast.success(publish ? 'Your course is live' : 'Course unpublished', {
        description: publish ? 'It now appears in the catalogue.' : 'It is hidden from the catalogue.',
      });
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not update the course.'));
    } finally {
      setPublishing(false);
    }
  };

  const deleteCourse = () =>
    confirm({
      title: 'Delete this course?',
      description: (
        <>
          This permanently removes <span className="font-semibold text-foreground">{course.title}</span>, all{' '}
          {pluralize(course.videos.length, 'lesson')} and their video files. Students lose access. This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete course',
      tone: 'danger',
      requireText: course.title,
      action: async () => {
        await coursesApi.remove(course.id).catch((e) => {
          throw new Error(getApiErrorMessage(e, 'Could not delete the course.'));
        });
        toast.success(`“${course.title}” deleted`);
        router.push('/dashboard');
      },
    });

  const lessonActions: LessonActions = {
    previewHref: (v) => `/courses/${course.id}?lesson=${v.id}`,
    onEdit: setEditingLesson,
    onReplace: (v) => {
      setReplacing(v);
      setAddOpen(true);
    },
    onRetry: async (v) => {
      try {
        await videosApi.retry(v.id);
        seen.current.set(v.id, 'UPLOADED');
        await load();
        toast.success(`Retrying “${v.title}”`, { description: "We'll let you know when it's ready." });
      } catch (e) {
        toast.error(getApiErrorMessage(e, 'Could not retry this lesson.'));
      }
    },
    onDelete: (v) =>
      confirm({
        title: `Delete “${v.title}”?`,
        description: 'The lesson and its video files are removed permanently.',
        confirmLabel: 'Delete lesson',
        tone: 'danger',
        action: async () => {
          await videosApi.remove(v.id).catch((e) => {
            throw new Error(getApiErrorMessage(e, 'Could not delete the lesson.'));
          });
          seen.current.delete(v.id);
          await load();
          toast.success('Lesson deleted');
        },
      }),
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setDroppedFile(file);
    setAddOpen(true);
  };

  return (
    <AppShell user={user}>
      <div
        className="relative mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
        onDragOver={onDragOver}
        onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={onDrop}
      >
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Your courses
        </Link>

        <section className="flex flex-col gap-5 rounded-panel border border-border bg-background p-4 sm:flex-row sm:items-center sm:p-5">
          <CourseCover id={course.id} title={course.title} thumbnail={course.thumbnail} coverVideoId={course.videos.find((v) => v.status === "READY")?.id ?? null} className="aspect-video w-full shrink-0 rounded-[12px] sm:w-56" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Badge tone={course.isPublished ? 'success' : 'warning'} dot>
              {course.isPublished ? 'Live' : 'Draft'}
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
            <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{course.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{formatPrice(course.price, course.currency)}</span>
              <span>{pluralize(course.videos.length, 'lesson')}</span>
              {totalLength ? <span>{courseLength(totalLength)}</span> : null}
              {course.videos.length !== ready.length ? <span>{ready.length} ready</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/courses/${course.id}`}>
                <Eye className="h-4 w-4" /> Preview
              </Link>
            </Button>
            {course.isPublished ? null : (
              <Button onClick={() => setPublished(true)} disabled={!canPublish || publishing} className="gap-2" title={canPublish ? undefined : 'Add a ready lesson first'}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Publish
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Course actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil /> Edit course details
                </DropdownMenuItem>
                {course.isPublished ? (
                  <DropdownMenuItem onSelect={() => setPublished(false)}>
                    <Globe /> Unpublish
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onSelect={deleteCourse}>
                  <Trash2 /> Delete course
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  Lessons
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {course.videos.length}
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">Drop a video anywhere on this page to add it.</p>
              </div>
              <Button onClick={() => setAddOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Add lesson
              </Button>
            </div>

            {course.videos.length === 0 ? (
              <EmptyState
                icon={<UploadCloud />}
                title="Add your first lesson"
                description="Upload a video and we'll prepare it in every quality your students need — up to 4K."
                action={
                  <Button onClick={() => setAddOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Add lesson
                  </Button>
                }
                className="py-16"
              />
            ) : (
              <div className="space-y-2.5">
                {course.videos.map((v, i) => (
                  <LessonRow key={v.id} video={v} index={i} actions={lessonActions} />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4 rounded-[14px] border border-border bg-background p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Publishing</h2>
              <Badge tone={course.isPublished ? 'success' : 'warning'} dot>
                {course.isPublished ? 'Live' : 'Draft'}
              </Badge>
            </div>
            {course.isPublished ? (
              <p className="text-sm text-muted-foreground">Your course is in the catalogue. Students can find it, enrol or buy it.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Only you can see this course until you publish it.</p>
                <PublishChecklist items={checklist} />
                <Button onClick={() => setPublished(true)} disabled={!canPublish || publishing} className="w-full gap-2">
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Publish course
                </Button>
              </>
            )}
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href={`/courses/${course.id}`}>
                <Eye className="h-4 w-4" /> See it as a student
              </Link>
            </Button>
          </aside>
        </div>

        {dragOver ? (
          <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/80">
            <div className="flex flex-col items-center gap-3 rounded-panel border-2 border-dashed border-primary bg-surface px-16 py-12 text-center">
              <UploadCloud className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold">Drop to add a lesson</p>
            </div>
          </div>
        ) : null}
      </div>

      <AddLessonDialog
        courseId={course.id}
        open={addOpen}
        initialFile={droppedFile}
        replace={replacing}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) {
            setDroppedFile(null);
            setReplacing(null);
          }
        }}
        onUploaded={(v) => {
          seen.current.set(v.id, 'UPLOADED');
          load();
        }}
      />
      <EditCourseDialog course={course} open={editOpen} onOpenChange={setEditOpen} onSaved={load} />
      <EditLessonDialog video={editingLesson} onClose={() => setEditingLesson(null)} onSaved={load} />
    </AppShell>
  );
}
