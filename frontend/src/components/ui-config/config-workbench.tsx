'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Columns2,
  Eye,
  FileJson,
  History,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  adminUiConfigApi,
  getApiErrorMessage,
  getApiErrorStatus,
  type CurrentUser,
  type UiConfigHistory,
  type UiConfigProblem,
  type UiConfigVersionDetail,
} from '@/lib/api';
import type { UiConfig } from '@/lib/ui-config';
import { changedSections, lineDiffStats, locatePointer } from '@/lib/ui-config/diff';
import type { DiffEditorApi, EditorMarker } from './config-diff-editor';
import { VersionTimeline } from './version-timeline';
import { ProblemsPanel, type PanelProblem } from './problems-panel';
import { StatusBar, type SaveState } from './status-bar';
import { ConfigDialog, type DialogSpec } from './config-dialog';
import { ConfigPreview } from './config-preview';
import { relativeTime } from './time';

// Monaco touches `window`: client-only, and only on this route.
const ConfigDiffEditor = dynamic(() => import('./config-diff-editor').then((m) => m.ConfigDiffEditor), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#0B0B10]" />,
});

const AUTOSAVE_MS = 1500;
const pretty = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;

type ParseResult = { ok: true; value: unknown } | { ok: false; message: string; line: number; column: number };

function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const message = (error as Error).message;
    const position = Number(/position (\d+)/.exec(message)?.[1] ?? 0);
    const before = text.slice(0, position);
    return { ok: false, message, line: before.split('\n').length, column: position - before.lastIndexOf('\n') };
  }
}

type Mode = { kind: 'draft' } | { kind: 'versions'; left: number; right: number };
type Dialog = { kind: 'publish' } | { kind: 'rollback'; version: number } | { kind: 'discard' };
type Toast = { tone: 'success' | 'warning' | 'error'; message: string };

export function ConfigWorkbench({ user }: { user: CurrentUser }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [published, setPublished] = useState<UiConfigVersionDetail | null>(null);
  const [history, setHistory] = useState<UiConfigHistory | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);

  const [baseVersion, setBaseVersion] = useState(0);
  const [draftText, setDraftText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<UiConfigProblem[]>([]);
  const [markers, setMarkers] = useState<EditorMarker[]>([]);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const [mode, setMode] = useState<Mode>({ kind: 'draft' });
  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [versionDocs, setVersionDocs] = useState<Record<number, UiConfig>>({});

  const [sideBySide, setSideBySide] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<'problems' | 'preview'>('problems');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [, setTick] = useState(0);

  const editorApi = useRef<DiffEditorApi | null>(null);
  const latest = useRef({ draftText, savedText, baseVersion });
  latest.current = { draftText, savedText, baseVersion };

  const flash = useCallback((next: Toast) => {
    setToast(next);
    window.setTimeout(() => setToast((t) => (t === next ? null : t)), 5000);
  }, []);

  const load = useCallback(async (opts: { keepDraftText?: string } = {}) => {
    setLoadError(null);
    try {
      const [view, versions, jsonSchema] = await Promise.all([
        adminUiConfigApi.get(),
        adminUiConfigApi.versions(1, 50),
        adminUiConfigApi.schema(),
      ]);
      setPublished(view.published);
      setHistory(versions);
      setSchema(jsonSchema);
      const publishedText = view.published ? pretty(view.published.config) : '';
      if (view.published) {
        setVersionDocs((docs) => ({ ...docs, [view.published!.version]: view.published!.config }));
      }
      if (opts.keepDraftText !== undefined) {
        setDraftText(opts.keepDraftText);
      } else if (view.draft) {
        const text = pretty(view.draft.config);
        setDraftText(text);
        setSavedText(text);
        setBaseVersion(view.draft.baseVersion);
        setHasDraft(true);
        setSavedAt(view.draft.updatedAt);
        setSaveState('saved');
      } else {
        setDraftText(publishedText);
        setSavedText(publishedText);
        setBaseVersion(view.published?.version ?? 0);
        setHasDraft(false);
        setSaveState('clean');
      }
      setLeftVersion(view.published?.version ?? null);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, 'Could not load the UI configuration.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // keep "saved 4s ago" honest
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const ensureDoc = useCallback(
    async (version: number) => {
      if (versionDocs[version]) return versionDocs[version];
      const detail = await adminUiConfigApi.version(version);
      setVersionDocs((docs) => ({ ...docs, [version]: detail.config }));
      return detail.config;
    },
    [versionDocs]
  );

  const save = useCallback(async () => {
    const { draftText: text, savedText: saved, baseVersion: base } = latest.current;
    if (text === saved || !base) return true;
    const parsed = parseJson(text);
    if (!parsed.ok) {
      setSaveState('invalid-json');
      return false;
    }
    setSaveState('saving');
    try {
      const problems = await adminUiConfigApi.saveDraft(base, parsed.value);
      setServerProblems(problems);
      setSavedText(text);
      setHasDraft(true);
      setSavedAt(new Date().toISOString());
      setSaveState(latest.current.draftText === text ? 'saved' : 'dirty');
      return true;
    } catch (error) {
      setSaveState('error');
      flash({ tone: 'error', message: getApiErrorMessage(error, 'The draft could not be saved.') });
      return false;
    }
  }, [flash]);

  // autosave once typing pauses
  useEffect(() => {
    if (loading || draftText === savedText) return;
    setSaveState('dirty');
    const id = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [draftText, savedText, loading, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latest.current.draftText !== latest.current.savedText) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const parsed = useMemo(() => parseJson(draftText), [draftText]);
  const publishedDoc = published?.config ?? null;
  const publishedText = useMemo(() => (publishedDoc ? pretty(publishedDoc) : ''), [publishedDoc]);
  const leftDoc = leftVersion !== null ? versionDocs[leftVersion] : publishedDoc;
  const leftText = leftDoc ? pretty(leftDoc) : publishedText;

  const inVersions = mode.kind === 'versions';
  const originalText = inVersions ? (versionDocs[mode.left] ? pretty(versionDocs[mode.left]) : '') : leftText;
  const modifiedText = inVersions ? (versionDocs[mode.right] ? pretty(versionDocs[mode.right]) : '') : draftText;

  const stats = useMemo(() => lineDiffStats(originalText, modifiedText), [originalText, modifiedText]);
  const changes = useMemo(
    () => (parsed.ok && publishedDoc ? changedSections(publishedDoc, parsed.value) : []),
    [parsed, publishedDoc]
  );

  const problems: PanelProblem[] = useMemo(() => {
    const list: PanelProblem[] = markers.map((m) => ({ ...m, source: 'schema' as const }));
    if (!parsed.ok && !markers.some((m) => m.severity === 'error')) {
      list.unshift({ severity: 'error', message: parsed.message, line: parsed.line, column: parsed.column, source: 'json' });
    }
    for (const p of serverProblems) {
      const at = locatePointer(draftText, p.path);
      list.push({ severity: 'error', message: p.message, path: p.path, line: at.line, column: at.column, source: 'server' });
    }
    return list;
  }, [markers, parsed, serverProblems, draftText]);

  const errorCount = problems.filter((p) => p.severity === 'error').length;
  const warningCount = problems.filter((p) => p.severity === 'warning').length;
  const stale = !!published && baseVersion !== published.version;
  const publishable = !inVersions && parsed.ok && errorCount === 0 && changes.length > 0 && saveState !== 'saving';

  const publishBlockedReason = inVersions
    ? 'Return to the draft to publish'
    : errorCount > 0
      ? `Fix ${errorCount} problem${errorCount === 1 ? '' : 's'} first`
      : changes.length === 0
        ? 'Nothing to publish — the draft matches what is live'
        : null;

  const selectDraft = () => {
    setMode({ kind: 'draft' });
    setLeftVersion(published?.version ?? null);
  };

  const compareWithDraft = async (version: number) => {
    try {
      await ensureDoc(version);
      if (mode.kind === 'versions') {
        setMode({ ...mode, right: version });
      } else {
        setLeftVersion(version);
      }
    } catch (error) {
      flash({ tone: 'error', message: getApiErrorMessage(error, `Could not load v${version}.`) });
    }
  };

  const compareTwo = async (version: number) => {
    try {
      const right = published?.version ?? version;
      await Promise.all([ensureDoc(version), ensureDoc(right)]);
      setMode({ kind: 'versions', left: version, right });
      flash({ tone: 'success', message: `Comparing v${version} with v${right}. Click any version to change the right side.` });
    } catch (error) {
      flash({ tone: 'error', message: getApiErrorMessage(error, 'Could not load those versions.') });
    }
  };

  const rebase = async () => {
    if (!published) return;
    setBaseVersion(published.version);
    latest.current.baseVersion = published.version;
    setSavedText('');
    flash({ tone: 'success', message: `Draft re-based onto v${published.version}.` });
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError(null);
  };

  const runDialog = async (message: string) => {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (dialog.kind === 'publish') {
        if (!(await save())) throw new Error('Fix the draft before publishing.');
        const version = await adminUiConfigApi.publish(latest.current.baseVersion, message);
        flash({ tone: 'success', message: `Published v${version}. Users see it within a minute.` });
        setDialog(null);
        setServerProblems([]);
        await load();
      } else if (dialog.kind === 'rollback') {
        const version = await adminUiConfigApi.rollback(dialog.version, message);
        flash({ tone: 'success', message: `Restored v${dialog.version} as v${version}.` });
        setDialog(null);
        await load({ keepDraftText: hasDraft ? latest.current.draftText : undefined });
      } else {
        await adminUiConfigApi.discardDraft();
        setDialog(null);
        setServerProblems([]);
        setMode({ kind: 'draft' });
        await load();
        flash({ tone: 'success', message: 'Draft discarded.' });
      }
    } catch (error) {
      const status = getApiErrorStatus(error);
      const body = (error as { response?: { data?: { currentVersion?: number; problems?: UiConfigProblem[] } } }).response?.data;
      if (status === 409 && body?.currentVersion) {
        // someone published while this draft was open: keep the edits, move the base
        const text = latest.current.draftText;
        setDialog(null);
        await load({ keepDraftText: text });
        setBaseVersion(body.currentVersion);
        latest.current.baseVersion = body.currentVersion;
        setSavedText('');
        flash({
          tone: 'warning',
          message: `v${body.currentVersion} was published while you were editing. Your draft now diffs against it — review, then publish again.`,
        });
      } else if (status === 400 && body?.problems) {
        setServerProblems(body.problems);
        setDialogError('The server rejected the draft — see Problems.');
        setPanelOpen(true);
        setPanelTab('problems');
      } else {
        setDialogError(getApiErrorMessage(error, 'That did not work. Please try again.'));
      }
    } finally {
      setDialogBusy(false);
    }
  };

  const dialogSpec: DialogSpec | null = !dialog
    ? null
    : dialog.kind === 'publish'
      ? {
          title: `Publish v${(published?.version ?? 0) + 1}`,
          description: 'Every user sees this within about a minute. The message is kept on the version history.',
          chips: changes,
          stats: published ? lineDiffStats(publishedText, draftText) : undefined,
          confirmLabel: 'Publish',
          messagePlaceholder: 'What changed, and why? e.g. "Rename Dashboard to Home"',
        }
      : dialog.kind === 'rollback'
        ? {
            title: `Restore v${dialog.version}`,
            description: `Publishes v${dialog.version}'s configuration as a new version. History is kept; your draft is not touched.`,
            confirmLabel: 'Restore and publish',
            messagePlaceholder: 'Why restore it?',
            defaultMessage: `Restore v${dialog.version}`,
          }
        : {
            title: 'Discard your draft?',
            description: 'Your unpublished changes are deleted. What is live does not change.',
            confirmLabel: 'Discard draft',
            tone: 'danger',
            messagePlaceholder: null,
          };

  const previewDoc = (parsed.ok ? parsed.value : publishedDoc) as UiConfig | null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0B10] text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" /> Loading the UI configuration…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0B0B10] text-zinc-300">
        <AlertTriangle className="h-6 w-6 text-amber-300" />
        <p>{loadError}</p>
        <button type="button" onClick={() => load()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Retry
        </button>
      </div>
    );
  }

  const leftLabel = inVersions ? `v${mode.left}` : `v${leftVersion ?? published?.version ?? 0}${leftVersion === published?.version ? ' (published)' : ''}`;
  const rightLabel = inVersions ? `v${mode.right}` : 'Draft';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0B10] text-zinc-200 [color-scheme:dark]">
      {/* Title bar */}
      <header className="relative flex h-10 shrink-0 items-center border-b border-white/[0.06] bg-[#0E0E13] px-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Admin
        </Link>
        <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] text-zinc-400">
          ui-config.json — <span className="text-zinc-200">UI Configuration</span>
        </p>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-zinc-400">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-[10px] font-bold text-[#0A0A0F]">
            {(user.name || user.email || 'A').slice(0, 2).toUpperCase()}
          </span>
          <span className="hidden sm:inline">{user.name || user.email}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <nav aria-label="Workbench" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-[#0E0E13] py-2">
          <ActivityButton label="Timeline" active={sidebarOpen} onClick={() => setSidebarOpen((o) => !o)}>
            <History className="h-5 w-5" />
          </ActivityButton>
          <ActivityButton
            label="Preview"
            active={panelOpen && panelTab === 'preview'}
            onClick={() => {
              setPanelOpen(true);
              setPanelTab('preview');
            }}
          >
            <Eye className="h-5 w-5" />
          </ActivityButton>
        </nav>

        {/* Side bar */}
        {sidebarOpen ? (
          <aside className="hidden w-72 shrink-0 flex-col border-r border-white/[0.06] bg-[#0E0E13] md:flex">
            <VersionTimeline
              versions={history?.versions ?? []}
              publishedVersion={history?.publishedVersion ?? published?.version ?? null}
              draftBase={baseVersion}
              draftDirty={draftText !== savedText}
              hasDraft={hasDraft}
              leftVersion={inVersions ? mode.left : leftVersion}
              compareRight={inVersions ? mode.right : null}
              onSelectDraft={selectDraft}
              onCompare={compareWithDraft}
              onCompareTwo={compareTwo}
              onRestore={(version) => setDialog({ kind: 'rollback', version })}
            />
          </aside>
        ) : null}

        {/* Editor group */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Tabs */}
          <div className="flex h-9 shrink-0 items-end border-b border-white/[0.06] bg-[#0E0E13]">
            <div className="relative flex h-9 items-center gap-2 border-r border-white/[0.06] bg-[#0B0B10] px-4 text-[13px] text-zinc-100">
              <span className="absolute inset-x-0 top-0 h-px bg-primary" />
              <FileJson className="h-4 w-4 text-amber-300" />
              ui-config.json
              <span className="text-zinc-500">
                {leftLabel} ↔ {rightLabel}
              </span>
              {draftText !== savedText && !inVersions ? <span className="h-2 w-2 rounded-full bg-zinc-300" aria-label="unsaved" /> : null}
            </div>
            <div className="ml-auto flex h-9 items-center gap-0.5 px-2">
              <ToolButton label="Previous change (⇧F7)" onClick={() => editorApi.current?.previousChange()}>
                <ChevronUp className="h-4 w-4" />
              </ToolButton>
              <ToolButton label="Next change (F7)" onClick={() => editorApi.current?.nextChange()}>
                <ChevronDown className="h-4 w-4" />
              </ToolButton>
              <ToolButton label={sideBySide ? 'Inline view' : 'Side-by-side view'} active={sideBySide} onClick={() => setSideBySide((s) => !s)}>
                <Columns2 className="h-4 w-4" />
              </ToolButton>
              <ToolButton label="Format document (⇧⌥F)" disabled={inVersions} onClick={() => editorApi.current?.format()}>
                <Wand2 className="h-4 w-4" />
              </ToolButton>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <ToolButton label="Discard draft" disabled={!hasDraft || inVersions} onClick={() => setDialog({ kind: 'discard' })}>
                <Trash2 className="h-4 w-4" />
              </ToolButton>
              <button
                type="button"
                disabled={!publishable}
                title={publishBlockedReason ?? 'Publish the draft'}
                onClick={() => setDialog({ kind: 'publish' })}
                className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.8)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
              >
                <Upload className="h-3.5 w-3.5" /> Publish
              </button>
            </div>
          </div>

          {/* Breadcrumbs / notices */}
          <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-white/[0.04] px-4 text-[12px] text-zinc-500">
            <span>backend</span>›<span>config</span>›<span>ui</span>›<span className="text-zinc-300">ui-config.json</span>
            {changes.length && !inVersions ? (
              <span className="ml-3 truncate text-zinc-500">
                changed: <span className="font-mono text-zinc-300">{changes.join(', ')}</span>
              </span>
            ) : null}
            {inVersions ? (
              <button type="button" onClick={selectDraft} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
                <X className="h-3 w-3" /> Close compare — back to draft
              </button>
            ) : null}
          </div>

          {stale && !inVersions ? (
            <div className="flex shrink-0 items-center gap-3 border-b border-amber-300/20 bg-amber-400/10 px-4 py-2 text-[12.5px] text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
              Your draft started from v{baseVersion}; v{published?.version} has been published since. The diff shows your draft against v
              {published?.version}.
              <button type="button" onClick={rebase} className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-200/30 px-2 py-0.5 hover:bg-amber-200/10">
                <RotateCcw className="h-3 w-3" /> Re-base onto v{published?.version}
              </button>
            </div>
          ) : null}

          {/* Editor */}
          <div className="relative min-h-0 flex-1">
            {sideBySide ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden grid-cols-2 text-[11px] uppercase tracking-wider text-zinc-500 lg:grid">
                <span className="justify-self-end pr-6 pt-1">{leftLabel} · read-only</span>
                <span className="justify-self-end pr-24 pt-1">{rightLabel}{inVersions ? ' · read-only' : ''}</span>
              </div>
            ) : null}
            <ConfigDiffEditor
              original={originalText}
              modified={modifiedText}
              readOnly={inVersions}
              sideBySide={sideBySide}
              schema={schema}
              apiRef={editorApi}
              onChange={(text) => {
                if (mode.kind === 'draft') setDraftText(text);
              }}
              onMarkers={setMarkers}
              onCursor={(line, column) => setCursor({ line, column })}
              onSave={() => void save()}
            />
          </div>

          {/* Panel */}
          <section className={cn('shrink-0 border-t border-white/[0.06] bg-[#0E0E13]', panelOpen ? 'h-64' : 'h-8')}>
            <div className="flex h-8 items-center gap-4 px-4 text-[11px] font-medium uppercase tracking-[0.1em]">
              <PanelTab active={panelOpen && panelTab === 'problems'} onClick={() => { setPanelOpen(true); setPanelTab('problems'); }}>
                Problems
                {problems.length ? (
                  <span className={cn('ml-1.5 rounded-full px-1.5 text-[10px]', errorCount ? 'bg-red-500/20 text-red-300' : 'bg-amber-400/20 text-amber-200')}>
                    {problems.length}
                  </span>
                ) : null}
              </PanelTab>
              <PanelTab active={panelOpen && panelTab === 'preview'} onClick={() => { setPanelOpen(true); setPanelTab('preview'); }}>
                Preview
              </PanelTab>
              <button
                type="button"
                aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
                onClick={() => setPanelOpen((o) => !o)}
                className="ml-auto grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-white/5"
              >
                {panelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
            {panelOpen ? (
              <div className="h-[calc(100%-2rem)]">
                {panelTab === 'problems' ? (
                  <ProblemsPanel
                    problems={problems}
                    onReveal={(p) => {
                      if (inVersions) selectDraft();
                      editorApi.current?.reveal(p.line, p.column);
                    }}
                  />
                ) : (
                  <ConfigPreview draft={previewDoc} live={publishedDoc} role={user.role} />
                )}
              </div>
            ) : null}
          </section>
        </main>
      </div>

      <StatusBar
        left={inVersions ? `v${mode.left} ↔ v${mode.right}` : `v${baseVersion} → draft`}
        errors={errorCount}
        warnings={warningCount}
        added={stats.added}
        removed={stats.removed}
        line={cursor.line}
        column={cursor.column}
        saveState={draftText !== savedText && saveState === 'saved' ? 'dirty' : saveState}
        savedAgo={savedAt ? relativeTime(savedAt) : null}
        publishedVersion={published?.version ?? null}
        onProblemsClick={() => {
          setPanelOpen(true);
          setPanelTab('problems');
        }}
      />

      {dialogSpec ? (
        <ConfigDialog spec={dialogSpec} busy={dialogBusy} error={dialogError} onConfirm={runDialog} onCancel={closeDialog} />
      ) : null}

      {toast ? (
        <div
          role="status"
          className={cn(
            'fixed bottom-10 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border bg-[#16161C] px-4 py-3 text-[13px] shadow-2xl',
            toast.tone === 'success' && 'border-emerald-400/25 text-emerald-100',
            toast.tone === 'warning' && 'border-amber-300/30 text-amber-100',
            toast.tone === 'error' && 'border-red-500/30 text-red-200'
          )}
        >
          <span className="flex-1">{toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ActivityButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative grid h-10 w-10 place-items-center rounded-md transition-colors',
        active ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
      )}
    >
      {active ? <span className="absolute -left-1 top-2 h-6 w-0.5 rounded bg-primary" /> : null}
      {children}
    </button>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30',
        active && 'bg-white/[0.06] text-zinc-100'
      )}
    >
      {children}
    </button>
  );
}

function PanelTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-8 items-center transition-colors',
        active ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      )}
    >
      {children}
      {active ? <span className="absolute inset-x-0 bottom-0 h-px bg-primary" /> : null}
    </button>
  );
}
