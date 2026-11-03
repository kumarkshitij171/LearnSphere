'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adminUiConfigApi,
  getApiErrorMessage,
  getApiErrorStatus,
  type UiConfigHistory,
  type UiConfigProblem,
  type UiConfigVersionDetail,
} from '@/lib/api';
import type { UiConfig } from '@/lib/ui-config';
import { changedSections, lineChanges, lineDiffStats, locatePointer } from '@/lib/ui-config/diff';
import type { EditorMarker } from './config-editor';
import type { PanelProblem } from './problems-panel';

const AUTOSAVE_MS = 1500;
const PAGE_SIZE = 50;

export const pretty = (doc: unknown) => `${JSON.stringify(doc, null, 2)}\n`;

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'invalid-json' | 'error';

export type PublishOutcome =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; currentVersion: number }
  | { ok: false; reason: 'invalid' | 'error'; message: string };

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

/**
 * Everything the UI-config page edits: the published version, the history, and the admin's draft
 * with autosave, validation and the publish / restore / discard calls. Views only render it.
 */
export function useUiConfigDraft() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [published, setPublished] = useState<UiConfigVersionDetail | null>(null);
  const [history, setHistory] = useState<UiConfigHistory | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [docs, setDocs] = useState<Record<number, UiConfig>>({});

  const [baseVersion, setBaseVersion] = useState(0);
  const [draftText, setDraftText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<UiConfigProblem[]>([]);
  const [markers, setMarkers] = useState<EditorMarker[]>([]);

  const latest = useRef({ draftText, savedText, baseVersion, hasDraft, docs });
  latest.current = { draftText, savedText, baseVersion, hasDraft, docs };

  const load = useCallback(async (opts: { keepDraftText?: string } = {}) => {
    setLoadError(null);
    try {
      const [view, versions, jsonSchema] = await Promise.all([
        adminUiConfigApi.get(),
        adminUiConfigApi.versions(1, PAGE_SIZE),
        adminUiConfigApi.schema(),
      ]);
      setPublished(view.published);
      setHistory(versions);
      setSchema(jsonSchema);
      const publishedText = view.published ? pretty(view.published.config) : '';
      if (view.published) {
        setDocs((all) => ({ ...all, [view.published!.version]: view.published!.config }));
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
    } catch (error) {
      setLoadError(getApiErrorMessage(error, 'Could not load the UI configuration.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!history || history.versions.length >= history.total) return;
    setLoadingMore(true);
    try {
      const next = await adminUiConfigApi.versions(Math.floor(history.versions.length / PAGE_SIZE) + 1, PAGE_SIZE);
      setHistory((current) => {
        if (!current) return next;
        const seen = new Set(current.versions.map((v) => v.version));
        return { ...current, versions: [...current.versions, ...next.versions.filter((v) => !seen.has(v.version))] };
      });
    } finally {
      setLoadingMore(false);
    }
  }, [history]);

  /** A version's full document, fetched once and cached. */
  const versionDoc = useCallback(async (version: number): Promise<UiConfig> => {
    const cached = latest.current.docs[version];
    if (cached) return cached;
    const detail = await adminUiConfigApi.version(version);
    setDocs((all) => ({ ...all, [version]: detail.config }));
    return detail.config;
  }, []);

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
    } catch {
      setSaveState('error');
      return false;
    }
  }, []);

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
  const publishedText = useMemo(() => (published ? pretty(published.config) : ''), [published]);
  const changes = useMemo(
    () => (parsed.ok && published ? changedSections(published.config, parsed.value) : []),
    [parsed, published]
  );
  const stats = useMemo(() => lineDiffStats(publishedText, draftText), [publishedText, draftText]);
  const gutter = useMemo(() => lineChanges(publishedText, draftText), [publishedText, draftText]);

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
  const edited = draftText !== publishedText;

  /** Why Review changes is disabled, or null when the draft can be reviewed. */
  const blockedReason = !parsed.ok
    ? 'Fix the JSON first'
    : errorCount > 0
      ? `Fix ${errorCount} problem${errorCount === 1 ? '' : 's'} first`
      : changes.length === 0
        ? 'Nothing to publish: the draft matches what is live'
        : null;

  /** The top-level keys of the draft (or, while it does not parse, of what is live), in file order. */
  const sections = useMemo(() => {
    const doc = parsed.ok ? parsed.value : published?.config;
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? Object.keys(doc as object) : [];
  }, [parsed, published]);

  const rebase = useCallback(() => {
    if (!published) return;
    setBaseVersion(published.version);
    latest.current.baseVersion = published.version;
    setSavedText('');
  }, [published]);

  const publish = useCallback(
    async (message: string): Promise<PublishOutcome> => {
      try {
        if (!(await save())) return { ok: false, reason: 'invalid', message: 'The draft could not be saved. Fix it, then publish.' };
        const version = await adminUiConfigApi.publish(latest.current.baseVersion, message);
        setServerProblems([]);
        await load();
        return { ok: true, version };
      } catch (error) {
        const status = getApiErrorStatus(error);
        const body = (error as { response?: { data?: { currentVersion?: number; problems?: UiConfigProblem[] } } }).response?.data;
        if (status === 409 && body?.currentVersion) {
          // someone published while this draft was open: keep the edits, move the base
          const text = latest.current.draftText;
          await load({ keepDraftText: text });
          setBaseVersion(body.currentVersion);
          latest.current.baseVersion = body.currentVersion;
          setSavedText('');
          return { ok: false, reason: 'conflict', currentVersion: body.currentVersion };
        }
        if (status === 400 && body?.problems) {
          setServerProblems(body.problems);
          return { ok: false, reason: 'invalid', message: 'The server rejected the draft. Its problems are listed under the editor.' };
        }
        return { ok: false, reason: 'error', message: getApiErrorMessage(error, 'That did not work. Please try again.') };
      }
    },
    [load, save]
  );

  const restore = useCallback(
    async (version: number, message: string) => {
      const created = await adminUiConfigApi.rollback(version, message);
      await load({ keepDraftText: latest.current.hasDraft ? latest.current.draftText : undefined });
      return created;
    },
    [load]
  );

  const discard = useCallback(async () => {
    await adminUiConfigApi.discardDraft();
    setServerProblems([]);
    await load();
  }, [load]);

  /** Starts the draft from another document (Copy to draft); autosave stores it on the live base. */
  const replaceDraft = useCallback(
    (text: string) => {
      if (published) {
        setBaseVersion(published.version);
        latest.current.baseVersion = published.version;
      }
      setDraftText(text);
    },
    [published]
  );

  return {
    loading,
    loadError,
    reload: load,
    published,
    publishedText,
    history,
    loadMore,
    loadingMore,
    versionDoc,
    schema,
    draftText,
    setDraftText,
    savedText,
    baseVersion,
    hasDraft,
    saveState: draftText !== savedText && saveState === 'saved' ? ('dirty' as const) : saveState,
    savedAt,
    save,
    parsed,
    changes,
    stats,
    gutter,
    sections,
    problems,
    setMarkers,
    errorCount,
    warningCount,
    stale,
    edited,
    blockedReason,
    rebase,
    publish,
    restore,
    discard,
    replaceDraft,
  };
}

export type UiConfigDraft = ReturnType<typeof useUiConfigDraft>;
