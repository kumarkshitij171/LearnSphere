'use client';

import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PanelProblem {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  column: number;
  /** json = syntax, schema = live editor check, server = the backend's authoritative check */
  source: 'json' | 'schema' | 'server';
  path?: string;
}

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;
const TONE = { error: 'text-danger', warning: 'text-warning', info: 'text-info' } as const;

/** Every problem in the draft; clicking one moves the cursor to it. */
export function ProblemsPanel({ problems, onReveal }: { problems: PanelProblem[]; onReveal: (p: PanelProblem) => void }) {
  return (
    <ul aria-label="Problems" className="max-h-48 overflow-y-auto py-1 font-mono text-[12.5px]">
      {problems.map((p, i) => {
        const Icon = ICON[p.severity];
        return (
          <li key={`${p.source}-${p.line}-${p.column}-${i}`}>
            <button
              type="button"
              onClick={() => onReveal(p)}
              className="flex w-full items-start gap-2 px-4 py-1.5 text-left transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
            >
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE[p.severity])} />
              <span className="min-w-0 flex-1 text-foreground">
                {p.path ? <span className="text-info">{p.path} </span> : null}
                {p.message}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {p.source} · Ln {p.line}, Col {p.column}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
