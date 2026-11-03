'use client';

import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { UiConfigVersionMeta } from '@/lib/api';
import { relativeTime } from './time';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Every published version, newest first: number, message, author and when. */
export function VersionList({
  versions,
  publishedVersion,
  selected,
  onSelect,
}: {
  versions: UiConfigVersionMeta[];
  publishedVersion: number | null;
  selected: number | null;
  onSelect: (version: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Versions"
      className="flex flex-col gap-0.5 p-1.5"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const at = versions.findIndex((v) => v.version === selected);
        const next = versions[Math.min(versions.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (!next) return;
        onSelect(next.version);
        e.currentTarget.querySelector<HTMLElement>(`[data-version="${next.version}"]`)?.focus();
      }}
    >
      {versions.map((v) => {
        const isSelected = v.version === selected;
        const by = v.createdBy?.name ?? 'System';
        return (
          <button
            key={v.version}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-version={v.version}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(v.version)}
            className={cn(
              'flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              isSelected ? 'bg-surface shadow-[inset_0_0_0_1px_hsl(var(--border))]' : 'hover:bg-surface/60'
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span className="font-mono text-[12.5px] font-medium">v{v.version}</span>
              {v.version === publishedVersion ? (
                <Badge tone="success" dot>
                  Live
                </Badge>
              ) : null}
              {v.rollbackOf ? (
                <Badge>
                  <RotateCcw className="h-3 w-3" /> Restored v{v.rollbackOf}
                </Badge>
              ) : null}
              <span className="ml-auto shrink-0 text-[12px] text-muted-foreground" title={new Date(v.createdAt).toLocaleString()}>
                {relativeTime(v.createdAt)}
              </span>
            </span>
            <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">{v.message}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span aria-hidden="true" className="grid h-[18px] w-[18px] place-items-center rounded-full bg-foreground/[0.08] text-[9px] font-semibold text-body">
                {initials(by)}
              </span>
              {by}
            </span>
          </button>
        );
      })}
    </div>
  );
}
