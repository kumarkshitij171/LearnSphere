'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import { EDITOR_FONT, defineThemes, useEditorTheme } from './monaco';
import { EditorSkeleton } from './config-editor';

type Diff = Parameters<DiffOnMount>[0];

/**
 * A read-only diff of two configuration texts, unchanged regions folded. Sized to its content
 * (between `minHeight` and `maxHeight`) so a one-line change does not leave a screen of blank.
 */
export function VersionDiff({
  original,
  modified,
  sideBySide,
  minHeight = 160,
  maxHeight = 640,
}: {
  original: string;
  modified: string;
  sideBySide: boolean;
  minHeight?: number;
  maxHeight?: number;
}) {
  const theme = useEditorTheme();
  const id = useId().replace(/:/g, '');
  const diffRef = useRef<Diff | null>(null);
  const disposers = useRef<Array<{ dispose(): void }>>([]);
  const [height, setHeight] = useState(minHeight);

  // The library would dispose the text models before the diff widget lets go of them, which makes
  // Monaco throw on unmount. It keeps them instead (keepCurrent*Model); we detach, then dispose.
  useEffect(() => {
    const subscriptions = disposers.current;
    return () => {
      subscriptions.forEach((d) => d.dispose());
      const diff = diffRef.current;
      if (!diff) return;
      const models = diff.getModel();
      try {
        diff.setModel(null);
      } catch {
        // already torn down
      }
      models?.original.dispose();
      models?.modified.dispose();
      diffRef.current = null;
    };
  }, []);

  const onMount: DiffOnMount = (diff) => {
    diffRef.current = diff;
    const fit = () => {
      const content = Math.max(diff.getOriginalEditor().getContentHeight(), diff.getModifiedEditor().getContentHeight());
      setHeight(Math.min(maxHeight, Math.max(minHeight, content + 2)));
    };
    disposers.current.push(
      diff.onDidUpdateDiff(fit),
      diff.getOriginalEditor().onDidContentSizeChange(fit),
      diff.getModifiedEditor().onDidContentSizeChange(fit)
    );
    fit();
  };

  return (
    <div style={{ height }}>
      <DiffEditor
        height="100%"
        language="json"
        theme={theme}
        original={original}
        modified={modified}
        originalModelPath={`inmemory://ui-config/${id}-before.json`}
        modifiedModelPath={`inmemory://ui-config/${id}-after.json`}
        beforeMount={defineThemes}
        onMount={onMount}
        keepCurrentOriginalModel
        keepCurrentModifiedModel
        loading={<EditorSkeleton />}
        options={{
          readOnly: true,
          domReadOnly: true,
          originalEditable: false,
          renderSideBySide: sideBySide,
          useInlineViewWhenSpaceIsLimited: true,
          // the history panel is ~760px wide; keep two columns there, fall back on phones
          renderSideBySideInlineBreakpoint: 560,
          automaticLayout: true,
          fontSize: 13,
          lineHeight: 20,
          fontFamily: EDITOR_FONT,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 8, bottom: 8 },
          hideUnchangedRegions: { enabled: true, contextLineCount: 2, minimumLineCount: 3, revealLineCount: 10 },
          renderOverviewRuler: false,
          renderValidationDecorations: 'off',
          ignoreTrimWhitespace: false,
          renderIndicators: true,
          stickyScroll: { enabled: false },
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false, alwaysConsumeMouseWheel: false },
        }}
      />
    </div>
  );
}
