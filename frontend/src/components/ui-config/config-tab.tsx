'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, CheckCircle2, FileJson, MonitorSmartphone, RotateCcw, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { UiConfig } from '@/lib/ui-config';
import { locatePointer } from '@/lib/ui-config/diff';
import type { ConfigEditorApi } from './config-editor';
import { ConfigPreview } from './config-preview';
import { ProblemsPanel } from './problems-panel';
import { SectionOutline } from './section-outline';
import { relativeTime } from './time';
import type { UiConfigDraft } from './use-ui-config-draft';

// Monaco touches `window`: client-only, and only on this route.
const ConfigEditor = dynamic(() => import('./config-editor').then((m) => m.ConfigEditor), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface/60" />,
});

/** "See and change the config": the whole file in one editor, what changed marked beside it. */
export function ConfigTab({ draft, role }: { draft: UiConfigDraft; role: string }) {
  const editorApi = useRef<ConfigEditorApi | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  // where each top-level key starts, so the outline can follow the cursor and jump on click
  const sectionLines = useMemo(
    () => draft.sections.map((key) => ({ key, line: locatePointer(draft.draftText, `/${key}`).line })),
    [draft.sections, draft.draftText]
  );
  const activeSection = sectionLines.filter((s) => s.line <= cursor.line).pop()?.key ?? null;

  const preview = (draft.parsed.ok ? draft.parsed.value : draft.published?.config ?? null) as UiConfig | null;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[12px] border border-border bg-surface/60 p-4 text-sm text-body md:hidden">
        <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" />
        Editing needs a wider screen. Open this page on a laptop or desktop; Version history works here.
      </p>

      <div className="hidden space-y-4 md:block">
        <DraftStrip draft={draft} />

        {draft.stale ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-warning/10 px-4 py-3 text-[13px] text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              Your draft started from v{draft.baseVersion}, and v{draft.published?.version} has been published since. Everything here compares your draft with
              v{draft.published?.version}.
            </span>
            <Button variant="outline" size="sm" onClick={draft.rebase}>
              <RotateCcw className="h-3.5 w-3.5" /> Re-base onto v{draft.published?.version}
            </Button>
          </div>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[176px_minmax(0,1fr)_320px]">
          <SectionOutline
            className="lg:sticky lg:top-6"
            sections={draft.sections}
            changed={draft.changes}
            active={activeSection}
            onSelect={(key) => {
              const at = sectionLines.find((s) => s.key === key);
              if (at) editorApi.current?.reveal(at.line);
            }}
          />

          <section aria-label="Editor" className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-background">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
              <FileJson className="h-4 w-4 text-warning" />
              <span className="font-mono text-[13px]">ui-config.json</span>
              <span className="text-[12px] text-muted-foreground">your draft · editable</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2.5" onClick={() => editorApi.current?.format()}>
                <Wand2 className="h-3.5 w-3.5" /> Format
              </Button>
            </div>
            <div className="h-[min(68vh,720px)] min-h-[440px]">
              <ConfigEditor
                value={draft.draftText}
                schema={draft.schema}
                changes={draft.gutter}
                apiRef={editorApi}
                onChange={draft.setDraftText}
                onMarkers={draft.setMarkers}
                onCursor={(line, column) => setCursor({ line, column })}
                onSave={() => void draft.save()}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3.5 py-2 text-[12px] text-body">
              {draft.errorCount === 0 ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Valid · schema v{draft.published?.schemaVersion ?? 2}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" /> {draft.errorCount} problem{draft.errorCount === 1 ? '' : 's'}
                </span>
              )}
              {draft.warningCount ? <span className="text-warning">{draft.warningCount} warning{draft.warningCount === 1 ? '' : 's'}</span> : null}
              <span className="ml-auto font-mono">
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span>JSON</span>
            </div>
            {draft.problems.length ? (
              <div className="border-t border-border">
                <ProblemsPanel problems={draft.problems} onReveal={(p) => editorApi.current?.reveal(p.line, p.column)} />
              </div>
            ) : null}
          </section>

          <div className="min-w-0 lg:col-span-2 xl:col-span-1">
            <ConfigPreview draft={preview} live={draft.published?.config ?? null} role={role} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftStrip({ draft }: { draft: UiConfigDraft }) {
  const state = draft.saveState;
  const saved =
    state === 'saving'
      ? 'Saving…'
      : state === 'dirty'
        ? 'Unsaved changes'
        : state === 'invalid-json'
          ? 'Not saved: the JSON is invalid'
          : state === 'error'
            ? 'Could not save, retrying when you type'
            : draft.savedAt
              ? `Saved ${relativeTime(draft.savedAt)}`
              : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-surface/60 px-4 py-2.5 text-[13px]">
      {draft.edited ? (
        <>
          <span className="font-medium">Draft</span>
          <span className="text-body">based on v{draft.baseVersion}</span>
          {saved ? (
            <span className={cn('text-body', (state === 'invalid-json' || state === 'error') && 'text-danger')}>· {saved}</span>
          ) : null}
          {draft.changes.length ? (
            <span className="flex flex-wrap items-center gap-1.5 text-body">
              · Changes in
              {draft.changes.map((key) => (
                <code key={key} className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                  {key}
                </code>
              ))}
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[12.5px] text-body">
            <span className="text-success">+{draft.stats.added}</span> <span className="text-danger">−{draft.stats.removed}</span> lines
          </span>
        </>
      ) : (
        <span className="text-body">
          No draft. This is what is live{draft.published ? ` (v${draft.published.version})` : ''}. Edit below to start one; nothing changes for users until you publish.
        </span>
      )}
    </div>
  );
}
