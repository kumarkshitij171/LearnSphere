'use client';

import { Eye, GitCompare, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UiConfigVersionMeta } from '@/lib/api';
import { relativeTime } from './time';

/**
 * VS Code's Timeline view: the draft pinned on top, then every version newest first. Clicking a
 * version diffs it against the draft; the second button pins it as the left side of a
 * version-to-version compare.
 */
export function VersionTimeline({
  versions,
  publishedVersion,
  draftBase,
  draftDirty,
  hasDraft,
  leftVersion,
  compareRight,
  onSelectDraft,
  onCompare,
  onCompareTwo,
  onRestore,
}: {
  versions: UiConfigVersionMeta[];
  publishedVersion: number | null;
  draftBase: number;
  draftDirty: boolean;
  hasDraft: boolean;
  leftVersion: number | null;
  compareRight: number | null;
  onSelectDraft: () => void;
  onCompare: (version: number) => void;
  onCompareTwo: (version: number) => void;
  onRestore: (version: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        Timeline
      </div>
      <div role="listbox" aria-label="Versions" className="min-h-0 flex-1 overflow-y-auto pb-4">
        <button
          type="button"
          role="option"
          aria-selected={compareRight === null}
          onClick={onSelectDraft}
          className={cn(
            'group relative flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]',
            compareRight === null && 'bg-white/[0.06]'
          )}
        >
          <span className="mt-1 flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className={cn('h-2.5 w-2.5 rounded-full', draftDirty ? 'bg-amber-300 shadow-[0_0_10px] shadow-amber-300/60' : 'bg-primary')} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
              Draft
              <span className="rounded border border-white/10 px-1.5 text-[10px] font-normal uppercase tracking-wide text-zinc-400">
                {draftDirty ? 'unsaved' : hasDraft ? 'saved' : 'clean'}
              </span>
            </span>
            <span className="block text-xs text-zinc-500">based on v{draftBase}</span>
          </span>
        </button>

        <div className="relative ml-[22px] border-l border-white/10">
          {versions.map((v) => {
            const isPublished = v.version === publishedVersion;
            const isLeft = v.version === leftVersion;
            const isCompareRight = v.version === compareRight;
            return (
              <div
                key={v.version}
                role="option"
                aria-selected={isLeft || isCompareRight}
                tabIndex={0}
                onClick={() => onCompare(v.version)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCompare(v.version);
                  }
                }}
                className={cn(
                  'group relative -ml-px cursor-pointer border-l py-2.5 pl-5 pr-3 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06]',
                  isLeft || isCompareRight ? 'border-primary bg-white/[0.05]' : 'border-transparent'
                )}
              >
                <span
                  className={cn(
                    'absolute -left-[5px] top-[15px] h-2 w-2 rounded-full ring-4 ring-[#0E0E13]',
                    isPublished ? 'bg-emerald-400' : 'bg-zinc-600'
                  )}
                />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-zinc-300">v{v.version}</span>
                  {isPublished ? (
                    <span className="rounded bg-emerald-400/15 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                      Published
                    </span>
                  ) : null}
                  {v.rollbackOf ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-sky-300">
                      <RotateCcw className="h-3 w-3" /> of v{v.rollbackOf}
                    </span>
                  ) : null}
                  {isLeft ? <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">left</span> : null}
                  {isCompareRight ? <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">right</span> : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-zinc-200">{v.message}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {v.createdBy?.name ?? 'System'} · {relativeTime(v.createdAt)}
                </p>

                <div className="absolute right-2 top-2 hidden items-center gap-0.5 rounded-md border border-white/10 bg-[#16161C] p-0.5 shadow-lg group-hover:flex group-focus-within:flex">
                  <IconButton label={`Diff v${v.version} against the draft`} onClick={() => onCompare(v.version)}>
                    <Eye className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label={`Compare another version with v${v.version}`} onClick={() => onCompareTwo(v.version)}>
                    <GitCompare className="h-3.5 w-3.5" />
                  </IconButton>
                  {!isPublished ? (
                    <IconButton label={`Restore v${v.version}`} onClick={() => onRestore(v.version)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid h-6 w-6 place-items-center rounded text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
    >
      {children}
    </button>
  );
}
