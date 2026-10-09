'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { DiffEditor, loader, type BeforeMount, type DiffOnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';

// Monaco is served from our own origin (scripts/copy-monaco.mjs → public/monaco/vs). The path must be
// absolute: the JSON language worker runs from a blob: URL, where "/monaco/vs" cannot be resolved,
// and validation then silently never runs.
loader.config({ paths: { vs: typeof window === 'undefined' ? '/monaco/vs' : `${window.location.origin}/monaco/vs` } });

export const THEME = 'learnsphere-dark';
const SCHEMA_URI = 'https://learnsphere.dev/schemas/ui-config.v1.json';

export interface EditorMarker {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
}

export interface DiffEditorApi {
  format(): void;
  reveal(line: number, column: number): void;
  nextChange(): void;
  previousChange(): void;
}

const defineTheme: BeforeMount = (monaco) => {
  // VS Code Dark+ token colours on the app's background, with lime as the accent.
  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '9CDCFE' },
      { token: 'string.value.json', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'keyword.json', foreground: '569CD6' },
      { token: 'delimiter', foreground: '808080' },
    ],
    colors: {
      'editor.background': '#0B0B10',
      'editor.foreground': '#E4E4E7',
      'editorGutter.background': '#0B0B10',
      'editorLineNumber.foreground': '#3F3F46',
      'editorLineNumber.activeForeground': '#A3E635',
      'editor.lineHighlightBackground': '#FFFFFF08',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#A3E635',
      'editor.selectionBackground': '#A3E63533',
      'editor.inactiveSelectionBackground': '#A3E6351A',
      'editorIndentGuide.background1': '#FFFFFF0D',
      'editorIndentGuide.activeBackground1': '#FFFFFF26',
      'editorBracketMatch.background': '#A3E6351F',
      'editorBracketMatch.border': '#A3E63566',
      'editorWidget.background': '#141419',
      'editorWidget.border': '#27272A',
      'editorSuggestWidget.background': '#141419',
      'editorSuggestWidget.selectedBackground': '#A3E6351F',
      'editorHoverWidget.background': '#141419',
      'editorHoverWidget.border': '#27272A',
      'diffEditor.insertedTextBackground': '#3FB95033',
      'diffEditor.removedTextBackground': '#F8514933',
      'diffEditor.insertedLineBackground': '#2EA0431A',
      'diffEditor.removedLineBackground': '#F8514914',
      'diffEditor.diagonalFill': '#FFFFFF0A',
      'diffEditorGutter.insertedLineBackground': '#2EA04333',
      'diffEditorGutter.removedLineBackground': '#F8514933',
      'diffEditor.unchangedRegionBackground': '#111116',
      'diffEditor.unchangedRegionForeground': '#71717A',
      'scrollbarSlider.background': '#FFFFFF14',
      'scrollbarSlider.hoverBackground': '#FFFFFF24',
      'scrollbarSlider.activeBackground': '#A3E63540',
      'minimap.background': '#0B0B10',
    },
  });
};

export function ConfigDiffEditor({
  original,
  modified,
  readOnly,
  sideBySide,
  schema,
  apiRef,
  onChange,
  onMarkers,
  onCursor,
  onSave,
}: {
  original: string;
  modified: string;
  readOnly: boolean;
  sideBySide: boolean;
  schema: Record<string, unknown> | null;
  apiRef: MutableRefObject<DiffEditorApi | null>;
  onChange: (text: string) => void;
  onMarkers: (markers: EditorMarker[]) => void;
  onCursor: (line: number, column: number) => void;
  onSave: () => void;
}) {
  // latest callbacks, so editor subscriptions made once on mount never call stale closures
  const handlers = useRef({ onChange, onMarkers, onCursor, onSave });
  handlers.current = { onChange, onMarkers, onCursor, onSave };
  const monacoRef = useRef<Parameters<BeforeMount>[0] | null>(null);
  const disposers = useRef<Array<{ dispose(): void }>>([]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !schema) return;
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      enableSchemaRequest: false,
      schemas: [{ uri: SCHEMA_URI, fileMatch: ['*'], schema }],
    });
  }, [schema]);

  useEffect(() => () => disposers.current.forEach((d) => d.dispose()), []);

  const beforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    defineTheme(monaco);
    if (schema) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: false,
        enableSchemaRequest: false,
        schemas: [{ uri: SCHEMA_URI, fileMatch: ['*'], schema }],
      });
    }
  };

  const onMount: DiffOnMount = (diff, monaco) => {
    const editor = diff.getModifiedEditor();
    const model = editor.getModel();
    // indentation is a model option, not an editor one
    model?.updateOptions({ tabSize: 2, insertSpaces: true });

    const reportMarkers = () => {
      if (!model) return;
      const severity = (s: number): EditorMarker['severity'] =>
        s === monaco.MarkerSeverity.Error ? 'error' : s === monaco.MarkerSeverity.Warning ? 'warning' : 'info';
      handlers.current.onMarkers(
        monaco.editor.getModelMarkers({ resource: model.uri }).map((m: MonacoEditor.IMarker) => ({
          severity: severity(m.severity),
          message: m.message,
          line: m.startLineNumber,
          column: m.startColumn,
        }))
      );
    };

    disposers.current.push(
      editor.onDidChangeModelContent(() => handlers.current.onChange(editor.getValue())),
      editor.onDidChangeCursorPosition((e) => handlers.current.onCursor(e.position.lineNumber, e.position.column)),
      monaco.editor.onDidChangeMarkers((uris) => {
        if (model && uris.some((uri) => uri.toString() === model.uri.toString())) reportMarkers();
      })
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlers.current.onSave());

    apiRef.current = {
      format: () => editor.getAction('editor.action.formatDocument')?.run(),
      reveal: (line, column) => {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column });
        editor.focus();
      },
      nextChange: () => (diff as unknown as { goToDiff?: (t: 'next') => void }).goToDiff?.('next'),
      previousChange: () => (diff as unknown as { goToDiff?: (t: 'previous') => void }).goToDiff?.('previous'),
    };
    reportMarkers();
  };

  return (
    <DiffEditor
      height="100%"
      language="json"
      theme={THEME}
      original={original}
      modified={modified}
      originalModelPath="inmemory://ui-config/base.json"
      modifiedModelPath="inmemory://ui-config/draft.json"
      beforeMount={beforeMount}
      onMount={onMount}
      loading={<EditorSkeleton />}
      options={{
        renderSideBySide: sideBySide,
        originalEditable: false,
        readOnly,
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "'JetBrains Mono', Menlo, Consolas, 'Courier New', monospace",
        fontLigatures: true,
        minimap: { enabled: true, renderCharacters: false, scale: 1 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 12, bottom: 12 },
        stickyScroll: { enabled: true },
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 5, revealLineCount: 20 },
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        renderOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
        formatOnPaste: true,
      }}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full w-full gap-px bg-white/5">
      {[0, 1].map((side) => (
        <div key={side} className="flex-1 space-y-2 bg-[#0B0B10] p-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-white/[0.04]"
              style={{ width: `${30 + ((i * 37 + side * 11) % 55)}%`, marginLeft: `${(i % 4) * 12}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
