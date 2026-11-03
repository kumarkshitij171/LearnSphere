'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Copy, Loader2, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UiConfig } from '@/lib/ui-config';
import { changedSections, lineDiffStats } from '@/lib/ui-config/diff';
import { Segmented } from './segmented';
import { VersionList } from './version-list';
import { pretty, type UiConfigDraft } from './use-ui-config-draft';

const VersionDiff = dynamic(() => import('./version-diff').then((m) => m.VersionDiff), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse bg-surface/60" />,
});

export type CompareMode = 'prev' | 'live' | 'draft';

export const parseCompare = (value: string | null): CompareMode => (value === 'live' || value === 'draft' ? value : 'prev');

type Side = { label: string; version: number | null; text?: string };

/** "Understand and undo past changes": the versions, and the selected one diffed against another. */
export function HistoryTab({
  draft,
  selected,
  compare,
  onSelect,
  onCompare,
  onCopyToDraft,
  onRestore,
}: {
  draft: UiConfigDraft;
  selected: number | null;
  compare: CompareMode;
  onSelect: (version: number) => void;
  onCompare: (mode: CompareMode) => void;
  onCopyToDraft: (version: number) => void;
  onRestore: (version: number) => void;
}) {
  const versions = useMemo(() => [...(draft.history?.versions ?? [])].sort((a, b) => b.version - a.version), [draft.history]);
  const live = draft.published?.version ?? null;
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'split' | 'inline'>('split');

  const q = query.trim().toLowerCase();
  const shown = q
    ? versions.filter((v) => v.message.toLowerCase().includes(q) || `v${v.version}` === q || String(v.version) === q)
    : versions;
  const current = versions.find((v) => v.version === selected) ?? versions.find((v) => v.version === live) ?? versions[0] ?? null;
  const previous = current ? versions[versions.indexOf(current) + 1] ?? null : null;
  const isLive = !!current && current.version === live;

  // what the selected version is compared with, and why there may be nothing to show
  let left: Side | null = null;
  let right: Side | null = null;
  let empty: { title: string; body: string } | null = null;
  if (current) {
    const self: Side = { label: `v${current.version}`, version: current.version };
    if (compare === 'prev') {
      if (previous) {
        left = { label: `v${previous.version}`, version: previous.version };
        right = self;
      } else {
        empty = { title: 'The first version', body: `Nothing came before v${current.version}. It is the configuration the app started with.` };
      }
    } else if (compare === 'live') {
      if (isLive) empty = { title: 'This is the live version', body: 'Pick an older version to see how it differs from what users see now.' };
      else {
        left = self;
        right = { label: `Live · v${live}`, version: live };
      }
    } else {
      left = self;
      right = { label: draft.edited ? 'Your draft' : 'Your draft (same as live)', version: null, text: draft.draftText };
    }
  }

  const [docs, setDocs] = useState<{ key: string; left: UiConfig; right: UiConfig | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const leftVersion = left?.version ?? null;
  const rightVersion = right?.version ?? null;
  const key = left ? `${leftVersion}:${rightVersion ?? 'draft'}` : null;
  const { versionDoc } = draft;
  useEffect(() => {
    if (leftVersion === null) return;
    let cancelled = false;
    setFailed(null);
    Promise.all([versionDoc(leftVersion), rightVersion === null ? Promise.resolve(null) : versionDoc(rightVersion)])
      .then(([l, r]) => {
        if (!cancelled) setDocs({ key: `${leftVersion}:${rightVersion ?? 'draft'}`, left: l, right: r });
      })
      .catch(() => {
        if (!cancelled) setFailed('Those versions could not be loaded. Try again in a moment.');
      });
    return () => {
      cancelled = true;
    };
  }, [leftVersion, rightVersion, versionDoc]);

  const ready = docs && docs.key === key ? docs : null;
  const leftText = ready ? pretty(ready.left) : '';
  const rightText = ready ? (ready.right ? pretty(ready.right) : right?.text ?? '') : '';
  const rightDoc = ready ? ready.right ?? (draft.parsed.ok ? draft.parsed.value : null) : null;
  const sections = useMemo(() => (ready && rightDoc ? changedSections(ready.left, rightDoc) : []), [ready, rightDoc]);
  const stats = useMemo(() => lineDiffStats(leftText, rightText), [leftText, rightText]);
  const identical = !!ready && leftText === rightText;

  if (!current) {
    return <p className="rounded-[14px] border border-dashed border-border p-10 text-center text-sm text-body">No version has been published yet.</p>;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <section aria-label="Versions" className="overflow-hidden rounded-[14px] border border-border bg-background">
        <div className="border-b border-border p-2.5">
          <label className="relative block">
            <span className="sr-only">Search version messages</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search messages, or v3" className="h-9 pl-9" />
          </label>
        </div>
        {shown.length ? (
          <VersionList versions={shown} publishedVersion={live} selected={current.version} onSelect={onSelect} />
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No version message matches “{query}”.</p>
        )}
        {draft.history && draft.history.versions.length < draft.history.total && !q ? (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full" disabled={draft.loadingMore} onClick={() => void draft.loadMore()}>
              {draft.loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Load older versions
            </Button>
          </div>
        ) : null}
      </section>

      <section aria-label={`Version ${current.version}`} className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-background">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1 basis-80 space-y-1">
            <p className="flex items-center gap-2">
              <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[13px] font-medium">v{current.version}</span>
              {isLive ? (
                <Badge tone="success" dot>
                  Live
                </Badge>
              ) : null}
              {current.rollbackOf ? (
                <Badge>
                  <RotateCcw className="h-3 w-3" /> Restored v{current.rollbackOf}
                </Badge>
              ) : null}
            </p>
            <h2 className="text-heading">{current.message}</h2>
            <p className="text-[12.5px] text-muted-foreground">
              {current.createdBy?.name ?? 'System'} · {new Date(current.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} ·
              schema v{current.schemaVersion}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={isLive} onClick={() => onCopyToDraft(current.version)}>
              <Copy className="h-3.5 w-3.5" /> Copy to draft
            </Button>
            <Button size="sm" disabled={isLive} onClick={() => onRestore(current.version)}>
              <RotateCcw className="h-3.5 w-3.5" /> {isLive ? 'Live now' : `Restore v${current.version}`}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/40 px-5 py-2.5">
          <Segmented
            label="Compare with"
            value={compare}
            onChange={onCompare}
            options={[
              { value: 'prev', label: `Changes in v${current.version}` },
              { value: 'live', label: `v${current.version} → live` },
              { value: 'draft', label: `v${current.version} → your draft` },
            ]}
          />
          <Segmented
            className="ml-auto"
            label="Diff layout"
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'split', label: 'Side by side' },
              { value: 'inline', label: 'Inline' },
            ]}
          />
        </div>

        <div className="space-y-3 p-5">
          {empty ? (
            <Empty title={empty.title} body={empty.body} />
          ) : failed ? (
            <Empty title="Could not load the diff" body={failed} />
          ) : !ready || !left || !right ? (
            <p className="flex items-center gap-2 text-sm text-body">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : identical ? (
            <Empty title="No differences" body={`${left.label} and ${right.label.toLowerCase()} hold the same configuration.`} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-body">
                Changed
                {sections.map((s) => (
                  <code key={s} className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                    {s}
                  </code>
                ))}
                <span className="ml-auto font-mono text-[12.5px]">
                  <span className="text-success">+{stats.added}</span> <span className="text-danger">−{stats.removed}</span>
                </span>
              </div>
              <div className="overflow-hidden rounded-[12px] border border-border">
                <div className="grid grid-cols-2 border-b border-border bg-surface/60 text-[12px] text-body">
                  {layout === 'split' ? (
                    <>
                      <span className="px-3 py-1.5">{left.label}</span>
                      <span className="border-l border-border px-3 py-1.5">{right.label}</span>
                    </>
                  ) : (
                    <span className="col-span-2 px-3 py-1.5">
                      {left.label} → {right.label}
                    </span>
                  )}
                </div>
                <VersionDiff original={leftText} modified={rightText} sideBySide={layout === 'split'} />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[12px] border border-dashed border-border px-6 py-12 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="max-w-md text-[13px] text-body">{body}</p>
    </div>
  );
}
