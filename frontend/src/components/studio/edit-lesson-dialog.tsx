'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { getApiErrorMessage, videosApi, type CourseVideo } from '@/lib/api';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video) return;
    setTitle(video.title);
    setDescription(video.description ?? '');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lesson</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Title</span>
            <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={description}
              rows={4}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              className="flex w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm transition-colors hover:border-white/20 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </label>
          {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
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
