'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DialogSpec {
  title: string;
  description?: string;
  /** chips shown above the message box, e.g. the changed sections */
  chips?: string[];
  stats?: { added: number; removed: number };
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** null = no message box (e.g. discard) */
  messagePlaceholder: string | null;
  defaultMessage?: string;
}

/**
 * A command-palette-style dialog: focused message box, ⌘/Ctrl+Enter confirms, Esc cancels. The
 * message becomes the version's audit-trail entry, so it is required where one is asked for.
 */
export function ConfigDialog({
  spec,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  spec: DialogSpec;
  busy: boolean;
  error: string | null;
  onConfirm: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState(spec.defaultMessage ?? '');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const valid = spec.messagePlaceholder === null || message.trim().length >= 3;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#141419] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)]"
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-zinc-100">{spec.title}</h2>
          {spec.description ? <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{spec.description}</p> : null}
          {spec.chips?.length || spec.stats ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {spec.chips?.map((chip) => (
                <span key={chip} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  {chip}
                </span>
              ))}
              {spec.stats ? (
                <span className="ml-auto font-mono text-[12px]">
                  <span className="text-emerald-400">+{spec.stats.added}</span>{' '}
                  <span className="text-red-400">−{spec.stats.removed}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {spec.messagePlaceholder !== null ? (
          <div className="px-5 pt-4">
            <textarea
              ref={inputRef}
              rows={3}
              maxLength={200}
              value={message}
              disabled={busy}
              placeholder={spec.messagePlaceholder}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && valid && !busy) onConfirm(message.trim());
              }}
              className="w-full resize-none rounded-lg border border-white/10 bg-[#0B0B10] px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-right text-[11px] text-zinc-500">⌘/Ctrl + Enter · {message.trim().length}/200</p>
          </div>
        ) : null}
        {error ? <p className="mx-5 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[13px] text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onConfirm(message.trim())}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              spec.tone === 'danger' ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {spec.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
