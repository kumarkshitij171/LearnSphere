'use client';

import { useRef, useState } from 'react';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { getApiErrorMessage } from '@/lib/api';
import { removeThumbnail, thumbnailProblem, uploadThumbnail, type ThumbnailTarget } from '@/lib/thumbnail';
import { cn } from '@/lib/utils';

/**
 * Upload or remove a thumbnail. It saves on its own, the moment a file is picked, so it never waits on
 * the surrounding form's Save. `preview` renders whatever is shown now: the custom image or the automatic one.
 */
export function ThumbnailField({
  target,
  current,
  preview,
  automaticLabel,
  onChange,
  className,
}: {
  target: ThumbnailTarget;
  current: string | null | undefined;
  preview: React.ReactNode;
  /** what students see when there is no custom image, e.g. "A frame from the video" */
  automaticLabel: string;
  onChange: (key: string | null) => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = percent !== null || removing;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = thumbnailProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPercent(0);
    try {
      const key = await uploadThumbnail(target, file, setPercent);
      onChange(key);
      toast.success('Thumbnail updated');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not upload the image.'));
    } finally {
      setPercent(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await removeThumbnail(target);
      onChange(null);
      toast.success('Thumbnail removed');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not remove the image.'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={cn('grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center', className)}>
      <div className="relative overflow-hidden rounded-[10px] ring-1 ring-inset ring-foreground/10">
        {preview}
        {percent !== null ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div className="h-full bg-highlight transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium">Thumbnail</p>
        <p className="text-[13px] text-body">
          {current ? 'Your image. ' : `${automaticLabel}. `}
          JPG, PNG or WebP, up to 5 MB. 16:9 works best.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id={`thumbnail-${target.kind}-${target.id}`}
            onChange={(e) => pick(e.target.files?.[0])}
            disabled={busy}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {percent !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
            {percent !== null ? `Uploading ${percent}%` : current ? 'Replace image' : 'Upload image'}
          </Button>
          {current ? (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Use automatic
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
