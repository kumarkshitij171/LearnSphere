'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, Clapperboard, FileVideo, Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getApiErrorMessage, type CourseVideo } from '@/lib/api';
import { formatBytes, titleFromFileName } from '@/lib/filename';
import { lessonLength } from '@/lib/format';
import { probeLocalVideo, replaceLessonFile, uploadLesson, uploadProblem, type LocalVideoInfo, type UploadProgress } from '@/lib/upload';
import { cn } from '@/lib/utils';

const TEXTAREA =
  'flex w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm placeholder:text-muted-foreground/60 transition-colors hover:border-white/20 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

function eta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'less than a minute left';
  const m = Math.round(seconds / 60);
  return `about ${m} min left`;
}

export function AddLessonDialog({
  courseId,
  open,
  onOpenChange,
  onUploaded,
  initialFile,
  replace,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (video: CourseVideo) => void;
  /** a file dropped onto the studio page, handed straight in */
  initialFile?: File | null;
  /** replace this lesson's video instead of adding a new lesson */
  replace?: CourseVideo | null;
}) {
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<LocalVideoInfo | null>(null);
  const [probing, setProbing] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'finishing'>('pick');
  const [dragging, setDragging] = useState(false);

  const busy = phase !== 'pick';

  const reset = () => {
    setFile(null);
    setInfo(null);
    setTitle('');
    setTitleTouched(false);
    setDescription('');
    setProblem(null);
    setProgress(null);
    setPhase('pick');
  };

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    const why = uploadProblem(f);
    setProblem(why);
    if (why) return;
    setFile(f);
    setInfo(null);
    if (!titleTouched) setTitle(titleFromFileName(f.name));
    setProbing(true);
    probeLocalVideo(f).then((i) => {
      setInfo(i);
      setProbing(false);
    });
  };

  useEffect(() => {
    if (open && initialFile) choose(initialFile);
    if (!open) reset();
    // only when the dialog opens with a dropped file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const requestClose = async () => {
    if (!busy) return onOpenChange(false);
    const stop = await confirm({
      title: 'Stop uploading?',
      description: 'The upload will be cancelled and nothing will be added to your course.',
      confirmLabel: 'Stop upload',
      tone: 'danger',
    });
    if (stop) {
      abortRef.current?.abort();
      onOpenChange(false);
    }
  };

  const start = async () => {
    if (!file || (!replace && !title.trim())) return;
    setProblem(null);
    setPhase('uploading');
    setProgress({ percent: 0, bytesPerSecond: 0, secondsLeft: null });
    abortRef.current = new AbortController();
    try {
      const opts = {
        signal: abortRef.current.signal,
        onProgress: (p: UploadProgress) => {
          setProgress(p);
          if (p.percent >= 100) setPhase('finishing');
        },
      };
      const video = replace
        ? await replaceLessonFile(replace.id, file, opts)
        : await uploadLesson(file, { courseId, title: title.trim(), description: description.trim() }, opts);
      toast.success(replace ? `Replacing the video for “${replace.title}”` : `“${video.title}” uploaded`, {
        description: "Processing has started — it'll be ready to watch in a few minutes.",
      });
      onUploaded(video);
      onOpenChange(false);
    } catch (e) {
      if (abortRef.current?.signal.aborted || (e as Error)?.name === 'CanceledError' || (e as Error)?.name === 'AbortError') {
        toast('Upload cancelled');
        return;
      }
      setPhase('pick');
      setProblem(getApiErrorMessage(e, 'The upload failed. Check your connection and try again.'));
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) choose(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
      <DialogContent size="lg" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{replace ? 'Replace video' : 'Add a lesson'}</DialogTitle>
          <DialogDescription>
            {replace ? (
              <>
                “{replace.title}” keeps its title and place in the course. Students won&apos;t see it while the new video is processing.
              </>
            ) : (
              <>Upload a video. We&apos;ll prepare it in every quality your viewers need.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center outline-none transition-colors',
                dragging ? 'border-primary bg-primary/[0.06]' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.02] focus-visible:border-primary/60'
              )}
            >
              <span className={cn('grid h-14 w-14 place-items-center rounded-2xl ring-1 transition-colors', dragging ? 'bg-primary/15 text-primary ring-primary/30' : 'bg-white/[0.04] text-muted-foreground ring-white/10 group-hover:text-foreground')}>
                <UploadCloud className="h-6 w-6" />
              </span>
              <div>
                <p className="font-medium">
                  {dragging ? 'Drop to add it' : (
                    <>
                      Drag a video here, or <span className="text-primary">browse</span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, MOV, WebM and most other formats · up to 5 GB</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="relative grid aspect-video w-36 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/60 ring-1 ring-white/10">
                {info?.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.poster} alt="" className="h-full w-full object-cover" />
                ) : probing ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <FileVideo className="h-6 w-6 text-muted-foreground" />
                )}
                {info?.duration ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    {lessonLength(info.duration)}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {info ? ` · ${Math.min(info.width, info.height)}p${info.height > info.width ? ' · vertical' : ''}` : ''}
                </p>
              </div>
              {!busy ? (
                <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                  Change
                </Button>
              ) : null}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mkv,.mov,.m4v"
            className="hidden"
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {file && !replace ? (
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Lesson title</span>
                <Input
                  value={title}
                  maxLength={200}
                  disabled={busy}
                  placeholder="e.g. Introduction"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                />
              </label>
              <label className="block space-y-2">
                <span className="flex items-center justify-between text-sm font-medium">
                  Description <span className="text-xs font-normal text-muted-foreground">optional</span>
                </span>
                <textarea
                  value={description}
                  maxLength={5000}
                  rows={3}
                  disabled={busy}
                  placeholder="What will students learn in this lesson?"
                  onChange={(e) => setDescription(e.target.value)}
                  className={TEXTAREA}
                />
              </label>
            </div>
          ) : null}

          {progress ? (
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  {phase === 'finishing' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Uploaded — adding it to your course…
                    </>
                  ) : (
                    <>
                      <Clapperboard className="h-3.5 w-3.5 text-primary" /> Uploading… {progress.percent}%
                    </>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {phase === 'uploading'
                    ? [progress.bytesPerSecond > 0 ? `${formatBytes(progress.bytesPerSecond)}/s` : '', eta(progress.secondsLeft)].filter(Boolean).join(' · ')
                    : ''}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-300 to-emerald-400 transition-[width] duration-300"
                  style={{ width: `${phase === 'finishing' ? 100 : progress.percent}%` }}
                />
              </div>
            </div>
          ) : null}

          {problem ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/20">{problem}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={requestClose}>
            {busy ? 'Cancel upload' : 'Cancel'}
          </Button>
          <Button onClick={start} disabled={!file || (!replace && !title.trim()) || busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {busy ? 'Uploading…' : replace ? 'Replace video' : 'Upload lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
