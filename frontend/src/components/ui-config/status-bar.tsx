'use client';

import { AlertCircle, AlertTriangle, Cloud, CloudOff, GitBranch, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid-json';

const SAVE_LABEL: Record<SaveState, string> = {
  clean: 'No changes',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Draft saved',
  error: 'Save failed — retrying',
  'invalid-json': 'Not saved — fix the JSON',
};

/** VS Code's status bar, in the app's accent colour. */
export function StatusBar({
  left,
  errors,
  warnings,
  added,
  removed,
  line,
  column,
  saveState,
  savedAgo,
  publishedVersion,
  onProblemsClick,
}: {
  left: string;
  errors: number;
  warnings: number;
  added: number;
  removed: number;
  line: number;
  column: number;
  saveState: SaveState;
  savedAgo: string | null;
  publishedVersion: number | null;
  onProblemsClick: () => void;
}) {
  const SaveIcon = saveState === 'saving' ? Loader2 : saveState === 'error' || saveState === 'invalid-json' ? CloudOff : Cloud;
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between bg-primary px-2 text-[12px] text-primary-foreground">
      <div className="flex items-center">
        <Item>
          <GitBranch className="h-3.5 w-3.5" />
          {left}
        </Item>
        <Item onClick={onProblemsClick} label="Show problems">
          <AlertCircle className="h-3.5 w-3.5" /> {errors}
          <AlertTriangle className="ml-1 h-3.5 w-3.5" /> {warnings}
        </Item>
        <Item>
          <span className="font-mono">+{added}</span>
          <span className="font-mono">−{removed}</span>
        </Item>
      </div>
      <div className="flex items-center">
        <Item>
          <SaveIcon className={cn('h-3.5 w-3.5', saveState === 'saving' && 'animate-spin')} />
          {SAVE_LABEL[saveState]}
          {saveState === 'saved' && savedAgo ? ` ${savedAgo}` : ''}
        </Item>
        <Item>
          Ln {line}, Col {column}
        </Item>
        <Item>Spaces: 2</Item>
        <Item>JSON</Item>
        <Item>Schema v1</Item>
        <Item>Live: v{publishedVersion ?? '—'}</Item>
      </div>
    </footer>
  );
}

function Item({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label?: string }) {
  const cls = 'flex h-6 items-center gap-1 px-2 transition-colors';
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} className={cn(cls, 'hover:bg-black/10')}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}
