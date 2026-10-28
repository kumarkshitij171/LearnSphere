'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import { getApiErrorMessage, videosApi, type CourseVideo } from '@/lib/api';
import { ThumbnailField } from './thumbnail-field';

export function EditLessonDialog({
  video,
  onClose,
  onSaved,
}: {
  video: CourseVideo | null;
  onClose: () => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    setTitle(video.title);
    setDescription(video.description ?? '');
    setThumbnail(video.thumbnail ?? null);
    setError(null);
  }, [video]);

  const save = async () => {
    if (!video) return;
    setSaving(true);
    setError(null);
    try {
      await videosApi.update(video.id, { title: title.trim(), description: description.trim() });
      await onSaved();
      toast.success('Lesson updated');
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not update the lesson.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(video)} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Edit lesson</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {video ? (
            <ThumbnailField
              target={{ kind: 'lesson', id: video.id }}
              current={thumbnail}
              automaticLabel={video.status === 'READY' ? 'A frame picked from the video' : 'A frame from the video, once it is processed'}
              onChange={(key) => {
                setThumbnail(key);
                void onSaved();
              }}
              preview={<LessonThumbnail video={{ ...video, thumbnail }} className="aspect-video w-full" />}
            />
          ) : null}
          <label className="block space-y-2">
            <span className="text-sm font-medium">Title</span>
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Description</span>
            <Textarea
              value={description}
              rows={4}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </label>
          {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !title.trim()} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
