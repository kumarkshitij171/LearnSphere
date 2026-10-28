'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
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
const TONE = { error: 'text-red-400', warning: 'text-amber-300', info: 'text-sky-300' } as const;

export function ProblemsPanel({ problems, onReveal }: { problems: PanelProblem[]; onReveal: (p: PanelProblem) => void }) {
  if (problems.length === 0) {
    return (
      <div className="flex h-full items-center gap-2 px-4 text-[13px] text-zinc-400">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        No problems have been detected in the draft.
      </div>
    );
  }
  return (
    <ul className="h-full overflow-y-auto py-1 font-mono text-[12.5px]">
      {problems.map((p, i) => {
        const Icon = ICON[p.severity];
        return (
          <li key={`${p.source}-${p.line}-${p.column}-${i}`}>
            <button
              type="button"
              onClick={() => onReveal(p)}
              className="flex w-full items-start gap-2 px-4 py-1 text-left transition-colors hover:bg-white/[0.04]"
            >
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE[p.severity])} />
              <span className="min-w-0 flex-1 text-zinc-200">
                {p.path ? <span className="text-sky-300">{p.path}</span> : null}
                {p.path ? ' ' : null}
                {p.message}
              </span>
              <span className="shrink-0 text-zinc-500">
                {p.source} [Ln {p.line}, Col {p.column}]
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
