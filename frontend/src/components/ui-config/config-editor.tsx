'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { LineChanges } from '@/lib/ui-config/diff';
import { EDITOR_FONT, defineThemes, registerSchema, useEditorTheme } from './monaco';

export interface EditorMarker {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
}

export interface ConfigEditorApi {
  format(): void;
  reveal(line: number, column?: number): void;
}

type Monaco = Parameters<BeforeMount>[0];

// Overview-ruler colours are painted on a canvas, so they cannot be tokens; these read on both looks.
const RULER = { modified: '#4C6EF5', added: '#2F9E5B', removed: '#E5533D' };

function decorationsFor(monaco: Monaco, changes: LineChanges): MonacoEditor.IModelDeltaDecoration[] {
  const mark = (line: number, kind: keyof typeof RULER): MonacoEditor.IModelDeltaDecoration => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `ls-gutter-${kind}`,
      overviewRuler: { color: RULER[kind], position: monaco.editor.OverviewRulerLane.Left },
    },
  });
  return [
    ...changes.modified.map((line) => mark(line, 'modified')),
    ...changes.added.map((line) => mark(line, 'added')),
    ...changes.removedAbove.map((line) => mark(line, 'removed')),
  ];
}

/** The draft, as one editable file. Lines that differ from what is live are marked in the gutter. */
export function ConfigEditor({
  value,
  schema,
  changes,
  apiRef,
  onChange,
  onMarkers,
  onCursor,
  onSave,
}: {
  value: string;
  schema: Record<string, unknown> | null;
  changes: LineChanges;
  apiRef: MutableRefObject<ConfigEditorApi | null>;
  onChange: (text: string) => void;
  onMarkers: (markers: EditorMarker[]) => void;
  onCursor: (line: number, column: number) => void;
  onSave: () => void;
}) {
  const theme = useEditorTheme();
  // latest callbacks, so subscriptions made once on mount never call stale closures
  const handlers = useRef({ onChange, onMarkers, onCursor, onSave });
  handlers.current = { onChange, onMarkers, onCursor, onSave };
  const latestChanges = useRef(changes);
  latestChanges.current = changes;
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const disposers = useRef<Array<{ dispose(): void }>>([]);

  useEffect(() => {
    if (monacoRef.current) registerSchema(monacoRef.current, schema);
  }, [schema]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco && decorations.current) decorations.current.set(decorationsFor(monaco, changes));
  }, [changes]);

  useEffect(() => {
    const subscriptions = disposers.current;
    return () => subscriptions.forEach((d) => d.dispose());
  }, []);

  const beforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    defineThemes(monaco);
    registerSchema(monaco, schema);
  };

  const onMount: OnMount = (editor, monaco) => {
    const model = editor.getModel();
    // indentation is a model option, not an editor one
    model?.updateOptions({ tabSize: 2, insertSpaces: true });
    decorations.current = editor.createDecorationsCollection(decorationsFor(monaco, latestChanges.current));
    // Geist Mono may finish loading after Monaco measured the fallback font
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    const reportMarkers = () => {
      if (!model) return;
      const severity = (s: number): EditorMarker['severity'] =>
        s === monaco.MarkerSeverity.Error ? 'error' : s === monaco.MarkerSeverity.Warning ? 'warning' : 'info';
      handlers.current.onMarkers(
        monaco.editor.getModelMarkers({ resource: model.uri }).map((m) => ({
          severity: severity(m.severity),
          message: m.message,
          line: m.startLineNumber,
          column: m.startColumn,
        }))
      );
    };

    disposers.current.push(
      editor.onDidChangeCursorPosition((e) => handlers.current.onCursor(e.position.lineNumber, e.position.column)),
      monaco.editor.onDidChangeMarkers((uris) => {
        if (model && uris.some((uri) => uri.toString() === model.uri.toString())) reportMarkers();
      })
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlers.current.onSave());

    apiRef.current = {
      format: () => void editor.getAction('editor.action.formatDocument')?.run(),
      reveal: (line, column = 1) => {
        editor.revealLineNearTop(line);
        editor.setPosition({ lineNumber: line, column });
        editor.focus();
      },
    };
    reportMarkers();
  };

  return (
    <Editor
      height="100%"
      defaultLanguage="json"
      path="inmemory://ui-config/draft.json"
      theme={theme}
      value={value}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(text) => handlers.current.onChange(text ?? '')}
      loading={<EditorSkeleton />}
      options={{
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: EDITOR_FONT,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
        stickyScroll: { enabled: true },
        guides: { indentation: true },
        lineDecorationsWidth: 14,
        glyphMargin: false,
        renderLineHighlight: 'line',
        overviewRulerBorder: false,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        formatOnPaste: true,
        tabSize: 2,
      }}
    />
  );
}

export function EditorSkeleton() {
  return (
    <div className="h-full w-full space-y-2 bg-background p-4" aria-hidden="true">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-surface"
          style={{ width: `${30 + ((i * 37) % 55)}%`, marginLeft: `${(i % 4) * 14}px` }}
        />
      ))}
    </div>
  );
}
