'use client';

import Link from 'next/link';
import { AlertTriangle, Loader2, MoreHorizontal, Pencil, Play, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LessonThumbnail } from '@/components/lesson-thumbnail';
import type { CourseVideo } from '@/lib/api';
import { lessonLength } from '@/lib/format';
import { failureCopy, isProcessing } from '@/lib/lesson-status';
import { cn } from '@/lib/utils';

export interface LessonActions {
  previewHref: (video: CourseVideo) => string;
  onEdit: (video: CourseVideo) => void;
  onDelete: (video: CourseVideo) => void;
  /** absent until the backend supports it; the action is hidden rather than faked */
  onReplace?: (video: CourseVideo) => void;
  onRetry?: (video: CourseVideo) => void;
}

function topQuality(video: CourseVideo): string {
  const top = video.resolutions?.[0];
  if (!top) return '';
  const short = Math.min(top.width, top.height);
  return short >= 2160 ? '4K' : `${short}p`;
}

export function LessonRow({ video, index, actions }: { video: CourseVideo; index: number; actions: LessonActions }) {
  const ready = video.status === 'READY';
  const failed = video.status === 'FAILED';
  const processing = isProcessing(video);
  const failure = failed ? failureCopy(video) : null;
  const length = lessonLength(video.duration);

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-[14px] border p-3 transition-colors',
        failed ? 'border-danger/25 bg-danger/[0.04]' : 'border-border bg-background hover:border-foreground/15 hover:bg-foreground/[0.025]'
      )}
    >
      <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>

      <LessonThumbnail video={video} className="aspect-video w-28 shrink-0 rounded-xl ring-1 ring-foreground/10 sm:w-36">
        {ready ? (
          <Link
            href={actions.previewHref(video)}
            aria-label={`Preview ${video.title}`}
            className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/35"
          >
            <span className="grid h-9 w-9 scale-90 place-items-center rounded-full bg-black/60 text-white opacity-0 ring-1 ring-foreground/20 transition group-hover:scale-100 group-hover:opacity-100">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </Link>
        ) : null}
        {processing ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white/90" />
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0 grid place-items-center bg-danger/50">
            <AlertTriangle className="h-5 w-5 text-danger" />
          </div>
        ) : null}
        {length ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">{length}</span>
        ) : null}
      </LessonThumbnail>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{video.title}</p>
        {failed && failure ? (
          <p className="line-clamp-2 text-sm text-danger/90">{failure.message}</p>
        ) : processing ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {video.status === 'UPLOADED' ? 'Queued for processing…' : 'Processing — this usually takes a few minutes'}
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-foreground/10">
              <div className="ui-indeterminate h-full w-1/3 rounded-full bg-foreground/70" />
            </div>
          </div>
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            {[topQuality(video), video.description].filter(Boolean).join(' · ') || 'Ready to watch'}
          </p>
        )}
      </div>

      <div className="hidden shrink-0 sm:block">
        {ready ? (
          <Badge tone="success" dot>Ready</Badge>
        ) : failed ? (
          <Badge tone="danger" dot>Failed</Badge>
        ) : (
          <Badge tone="info" dot>{video.status === 'UPLOADED' ? 'Queued' : 'Processing'}</Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {failed && actions.onReplace ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.onReplace?.(video)}>
            <RefreshCw className="h-3.5 w-3.5" /> Replace
          </Button>
        ) : null}
        {failed && failure?.canRetry && actions.onRetry ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => actions.onRetry?.(video)}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        ) : null}
        {ready ? (
          <Button asChild size="sm" variant="ghost" className="hidden gap-1.5 md:inline-flex">
            <Link href={actions.previewHref(video)}>
              <Play className="h-3.5 w-3.5" /> Preview
            </Link>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`More actions for ${video.title}`} className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => actions.onEdit(video)}>
              <Pencil /> Edit title and description
            </DropdownMenuItem>
            {actions.onReplace ? (
              <DropdownMenuItem onSelect={() => actions.onReplace?.(video)}>
                <RefreshCw /> Replace video
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem tone="danger" onSelect={() => actions.onDelete(video)}>
              <Trash2 /> Delete lesson
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
