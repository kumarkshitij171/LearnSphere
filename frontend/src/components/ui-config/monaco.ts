'use client';

import { useEffect, useState } from 'react';
import { loader, type Monaco } from '@monaco-editor/react';

// Monaco is served from our own origin (scripts/copy-monaco.mjs → public/monaco/vs). The path must be
// absolute: the JSON language worker runs from a blob: URL, where "/monaco/vs" cannot be resolved,
// and validation then silently never runs.
loader.config({ paths: { vs: typeof window === 'undefined' ? '/monaco/vs' : `${window.location.origin}/monaco/vs` } });

export const LIGHT_THEME = 'learnsphere-light';
export const DARK_THEME = 'learnsphere-dark';
export const EDITOR_FONT = 'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace';
const SCHEMA_URI = 'https://learnsphere.dev/schemas/ui-config.v1.json';

/** Both looks' themes, built from the app's tokens (globals.css) since Monaco cannot read CSS variables. */
export function defineThemes(monaco: Monaco) {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '2848D7' },
      { token: 'string.value.json', foreground: 'A25C07' },
      { token: 'number', foreground: '8A3FB8' },
      { token: 'keyword.json', foreground: '8A3FB8' },
      { token: 'delimiter', foreground: '59595F' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#111113',
      'editorGutter.background': '#FFFFFF',
      'editorLineNumber.foreground': '#8D8D91',
      'editorLineNumber.activeForeground': '#111113',
      'editor.lineHighlightBackground': '#F4F4F5',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#111113',
      'editor.selectionBackground': '#2848D726',
      'editor.inactiveSelectionBackground': '#2848D714',
      'editorIndentGuide.background1': '#E6E6EA',
      'editorIndentGuide.activeBackground1': '#C9C9CF',
      'editorBracketMatch.background': '#2848D714',
      'editorBracketMatch.border': '#2848D766',
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#E6E6EA',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#E6E6EA',
      'editorSuggestWidget.selectedBackground': '#F0F0F2',
      'editorHoverWidget.background': '#FFFFFF',
      'editorHoverWidget.border': '#E6E6EA',
      'diffEditor.insertedTextBackground': '#17824B38',
      'diffEditor.removedTextBackground': '#C2320A2E',
      'diffEditor.insertedLineBackground': '#17824B17',
      'diffEditor.removedLineBackground': '#C2320A14',
      'diffEditorGutter.insertedLineBackground': '#17824B24',
      'diffEditorGutter.removedLineBackground': '#C2320A1F',
      'diffEditor.diagonalFill': '#0000000D',
      'diffEditor.unchangedRegionBackground': '#F4F4F5',
      'diffEditor.unchangedRegionForeground': '#59595F',
      'scrollbarSlider.background': '#11111314',
      'scrollbarSlider.hoverBackground': '#11111324',
      'scrollbarSlider.activeBackground': '#11111333',
      'editorOverviewRuler.border': '#00000000',
    },
  });
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '9CDCFE' },
      { token: 'string.value.json', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'keyword.json', foreground: '569CD6' },
      { token: 'delimiter', foreground: '8B8B93' },
    ],
    colors: {
      'editor.background': '#151519',
      'editor.foreground': '#F1F1EF',
      'editorGutter.background': '#151519',
      'editorLineNumber.foreground': '#6B6B75',
      'editorLineNumber.activeForeground': '#F1F1EF',
      'editor.lineHighlightBackground': '#FFFFFF08',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#F1F1EF',
      'editor.selectionBackground': '#7AA2FF33',
      'editor.inactiveSelectionBackground': '#7AA2FF1F',
      'editorIndentGuide.background1': '#FFFFFF0D',
      'editorIndentGuide.activeBackground1': '#FFFFFF26',
      'editorBracketMatch.background': '#7AA2FF1F',
      'editorBracketMatch.border': '#7AA2FF66',
      'editorWidget.background': '#1F1F23',
      'editorWidget.border': '#2D2D34',
      'editorSuggestWidget.background': '#1F1F23',
      'editorSuggestWidget.border': '#2D2D34',
      'editorSuggestWidget.selectedBackground': '#2A2A30',
      'editorHoverWidget.background': '#1F1F23',
      'editorHoverWidget.border': '#2D2D34',
      'diffEditor.insertedTextBackground': '#3FB95033',
      'diffEditor.removedTextBackground': '#F8514933',
      'diffEditor.insertedLineBackground': '#2EA0431A',
      'diffEditor.removedLineBackground': '#F8514914',
      'diffEditorGutter.insertedLineBackground': '#2EA04333',
      'diffEditorGutter.removedLineBackground': '#F8514933',
      'diffEditor.diagonalFill': '#FFFFFF0A',
      'diffEditor.unchangedRegionBackground': '#1F1F23',
      'diffEditor.unchangedRegionForeground': '#A3A3AD',
      'scrollbarSlider.background': '#FFFFFF14',
      'scrollbarSlider.hoverBackground': '#FFFFFF24',
      'scrollbarSlider.activeBackground': '#FFFFFF33',
      'editorOverviewRuler.border': '#00000000',
    },
  });
}

export function registerSchema(monaco: Monaco, schema: Record<string, unknown> | null) {
  if (!schema) return;
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: false,
    schemas: [{ uri: SCHEMA_URI, fileMatch: ['*'], schema }],
  });
}

/** The Monaco theme for the viewer's current look; follows the theme toggle without a reload. */
export function useEditorTheme(): string {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-look') === 'theater');
    read();
    window.addEventListener('ls-look', read);
    return () => window.removeEventListener('ls-look', read);
  }, []);
  return dark ? DARK_THEME : LIGHT_THEME;
}
