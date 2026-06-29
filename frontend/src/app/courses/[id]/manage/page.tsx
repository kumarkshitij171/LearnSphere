'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Pencil,
  Trash2,
  Play,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AppShell } from '@/components/app-shell';
import { VideoUpload } from '@/components/video-upload';
import { HlsPlayer } from '@/lib/player';
import { masterPlaylistUrl } from '@/lib/playback';
import { useRequireRole } from '@/hooks/useRequireAuth';
import {
  coursesApi,
  videosApi,
  getApiErrorMessage,
  type CourseDetail,
  type CourseVideo,
} from '@/lib/api';

const TEXTAREA_CLS =
  'flex w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-white/20 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50';

function StatusPill({ status }: { status: CourseVideo['status'] }) {
  const map = {
    READY: { icon: CheckCircle2, cls: 'text-emerald-300', label: 'Ready' },
    FAILED: { icon: XCircle, cls: 'text-destructive', label: 'Failed' },
    TRANSCODING: { icon: Loader2, cls: 'text-amber-300 animate-spin', label: 'Transcoding' },
    UPLOADED: { icon: Clock, cls: 'text-sky-300', label: 'Queued' },
  }[status];
  const Icon = map.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className={`h-4 w-4 ${map.cls}`} /> {map.label}
    </span>
  );
}

function VideoRow({ video, onChanged }: { video: CourseVideo; onChanged: () => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setRowError(null);
    try {
      await videosApi.update(video.id, { title: title.trim(), description: description.trim() });
      setEditing(false);
      await onChanged();
    } catch (e) {
      setRowError(getApiErrorMessage(e, 'Could not update the video.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${video.title}"? This removes the video and its files permanently.`)) return;
    setDeleting(true);
    setRowError(null);
    try {
      await videosApi.remove(video.id);
      await onChanged();
    } catch (e) {
      setRowError(getApiErrorMessage(e, 'Could not delete the video.'));
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 px-4 py-3">
      {editing ? (
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className={TEXTAREA_CLS}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !title.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setTitle(video.title);
                setDescription(video.description ?? '');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{video.title}</p>
            {video.description ? (
              <p className="truncate text-sm text-muted-foreground">{video.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusPill status={video.status} />
            {video.status === 'READY' && (
              <Button size="icon" variant="ghost" onClick={() => setShowPlayer((s) => !s)} title="Preview">
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={remove} disabled={deleting} title="Delete">
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          </div>
        </div>
      )}
      {rowError && <p className="mt-2 text-sm text-destructive">{rowError}</p>}
      {showPlayer && video.status === 'READY' && (
        <div className="mt-3">
          <HlsPlayer src={masterPlaylistUrl(video)} className="overflow-hidden rounded-lg" />
        </div>
      )}
    </div>
  );
}

export default function ManageCoursePage() {
  const { user, checking } = useRequireRole(['INSTRUCTOR', 'ADMIN']);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = params.id;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Course detail editing
  const [editingCourse, setEditingCourse] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', price: 0 });
  const [savingCourse, setSavingCourse] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setCourse(await coursesApi.getById(courseId));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the course.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any video is still processing.
  useEffect(() => {
    const processing = course?.videos.some((v) => v.status === 'UPLOADED' || v.status === 'TRANSCODING');
    if (processing && !pollRef.current) {
      pollRef.current = setInterval(load, 5000);
    } else if (!processing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [course, load]);

  const togglePublish = async () => {
    if (!course) return;
    setPublishing(true);
    try {
      await coursesApi.update(course.id, { isPublished: !course.isPublished });
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not update the course.'));
    } finally {
      setPublishing(false);
    }
  };

  const startEditCourse = () => {
    if (!course) return;
    setForm({ title: course.title, description: course.description, price: course.price });
    setEditingCourse(true);
  };

  const saveCourse = async () => {
    if (!course) return;
    setSavingCourse(true);
    setError(null);
    try {
      await coursesApi.update(course.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price) || 0,
      });
      setEditingCourse(false);
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not save the course.'));
    } finally {
      setSavingCourse(false);
    }
  };

  const deleteCourse = async () => {
    if (!course) return;
    if (
      !window.confirm(
        `Delete "${course.title}"? This permanently removes the course, all its videos, and all enrollments.`
      )
    )
      return;
    setDeletingCourse(true);
    setError(null);
    try {
      await coursesApi.remove(course.id);
      router.push('/dashboard');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not delete the course.'));
      setDeletingCourse(false);
    }
  };

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
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
          {error || 'Course not found.'}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        {editingCourse ? (
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-lg">Edit course</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Course title"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Course description"
                rows={4}
                className={TEXTAREA_CLS}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                placeholder="Price"
              />
              <div className="flex gap-2">
                <Button onClick={saveCourse} disabled={savingCourse || !form.title.trim()} className="gap-1.5">
                  {savingCourse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </Button>
                <Button variant="outline" onClick={() => setEditingCourse(false)} disabled={savingCourse}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">{course.title}</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{course.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={togglePublish}
                disabled={publishing}
                variant={course.isPublished ? 'outline' : 'default'}
                className="gap-2"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                {course.isPublished ? 'Unpublish' : 'Publish'}
              </Button>
              <Button onClick={startEditCourse} variant="outline" className="gap-2">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button onClick={deleteCourse} disabled={deletingCourse} variant="destructive" className="gap-2">
                {deletingCourse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <Card className="glass border-white/10">
            <CardHeader>
              <CardTitle className="text-lg">Videos ({course.videos.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {course.videos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No videos yet. Upload your first lesson.</p>
              ) : (
                course.videos.map((v) => <VideoRow key={v.id} video={v} onChanged={load} />)
              )}
            </CardContent>
          </Card>

          <VideoUpload courseId={course.id} onUploaded={load} />
        </div>
      </div>
    </AppShell>
  );
}
