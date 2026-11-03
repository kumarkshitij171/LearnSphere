'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Check, Loader2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Segmented } from './segmented';
import type { PublishOutcome, UiConfigDraft } from './use-ui-config-draft';

const VersionDiff = dynamic(() => import('./version-diff').then((m) => m.VersionDiff), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse bg-surface/60" />,
});

const MIN_MESSAGE = 3;
const MAX_MESSAGE = 200;

/** The step in front of Publish: exactly what will change for users, the checks, and why. */
export function ReviewSheet({
  open,
  onOpenChange,
  draft,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: UiConfigDraft;
  onPublished: (version: number) => void;
}) {
  const [message, setMessage] = useState('');
  const [layout, setLayout] = useState<'split' | 'inline'>('split');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'warning' | 'danger'; text: string } | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const live = draft.published?.version ?? 0;
  const next = live + 1;
  const trimmed = message.trim();
  const blocked = draft.blockedReason;
  const canPublish = !busy && !blocked && trimmed.length >= MIN_MESSAGE;

  useEffect(() => {
    if (open) setNotice(null);
  }, [open]);

  const submit = async () => {
    if (!canPublish) return;
    setBusy(true);
    setNotice(null);
    const outcome: PublishOutcome = await draft.publish(trimmed);
    setBusy(false);
    if (outcome.ok) {
      setMessage('');
      onOpenChange(false);
      onPublished(outcome.version);
    } else if (outcome.reason === 'conflict') {
      setNotice({
        tone: 'warning',
        text: `v${outcome.currentVersion} was published while you were reviewing. The diff now compares your draft with it: check it, then publish again.`,
      });
    } else {
      setNotice({ tone: 'danger', text: outcome.message });
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="ui-sheet-right fixed inset-y-0 right-0 z-50 flex w-full max-w-[1040px] flex-col border-l border-border bg-background text-foreground shadow-overlay outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            messageRef.current?.focus({ preventScroll: true });
          }}
        >
          <div className="flex items-start gap-3 border-b border-border px-6 py-5 sm:px-7">
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="text-title">Review changes</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-body">
                Live v{live} → v{next}. Read the diff, say why, then publish.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close review"
              disabled={busy}
              className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-7">
            <ul className="flex flex-wrap gap-2" aria-label="Checks">
              {draft.errorCount === 0 && draft.parsed.ok ? (
                <CheckChip tone="success">Valid against schema v{draft.published?.schemaVersion ?? 2}</CheckChip>
              ) : (
                <CheckChip tone="danger">
                  {draft.errorCount || 1} problem{draft.errorCount === 1 ? '' : 's'} to fix before publishing
                </CheckChip>
              )}
              {draft.stale ? (
                <CheckChip tone="warning">
                  Your draft started from v{draft.baseVersion}; it is compared with live v{live}
                </CheckChip>
              ) : (
                <CheckChip tone="success">v{live} is still live. Nobody published while you edited</CheckChip>
              )}
              <li className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[12.5px] text-body">
                Changed
                {draft.changes.map((key) => (
                  <code key={key} className="rounded-md border border-border bg-background px-1.5 py-px font-mono text-[11.5px] text-foreground">
                    {key}
                  </code>
                ))}
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-body">
                <span className="text-success">+{draft.stats.added}</span>
                <span className="text-danger">−{draft.stats.removed}</span>
                lines
              </li>
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[13px] font-medium">What will change for users</h3>
              <Segmented
                className="ml-auto"
                label="Diff layout"
                value={layout}
                onChange={setLayout}
                options={[
                  { value: 'split', label: 'Side by side' },
                  { value: 'inline', label: 'Inline' },
                ]}
              />
            </div>
            <div className="overflow-hidden rounded-[12px] border border-border">
              <div className="grid grid-cols-2 border-b border-border bg-surface/60 text-[12px] text-body">
                {layout === 'split' ? (
                  <>
                    <span className="px-3 py-1.5">Live · v{live} (read-only)</span>
                    <span className="border-l border-border px-3 py-1.5">Your draft → v{next}</span>
                  </>
                ) : (
                  <span className="col-span-2 px-3 py-1.5">Live · v{live} → your draft</span>
                )}
              </div>
              {open ? <VersionDiff original={draft.publishedText} modified={draft.draftText} sideBySide={layout === 'split'} maxHeight={560} /> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publish-message">
                Version message <span className="font-normal text-muted-foreground">(required, kept in the history)</span>
              </Label>
              <Textarea
                id="publish-message"
                ref={messageRef}
                rows={2}
                maxLength={MAX_MESSAGE}
                value={message}
                disabled={busy}
                placeholder="What changed, and why? e.g. Rename My courses to My learning"
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <p className="flex justify-between text-[12px] text-muted-foreground">
                <span>
                  <Kbd>⌘</Kbd> <Kbd>↵</Kbd> publishes
                </span>
                <span>
                  {trimmed.length}/{MAX_MESSAGE}
                </span>
              </p>
            </div>

            {notice ? (
              <p
                role="alert"
                className={cn(
                  'flex items-start gap-2 rounded-[10px] px-3.5 py-2.5 text-[13px] text-foreground',
                  notice.tone === 'warning' ? 'bg-warning/10' : 'bg-danger/10'
                )}
              >
                <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', notice.tone === 'warning' ? 'text-warning' : 'text-danger')} />
                {notice.text}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface/40 px-6 py-4 sm:px-7">
            <p className="min-w-0 flex-1 basis-72 text-[13px] text-body">
              {blocked ?? `Every user sees this within about a minute. v${live} stays in Version history, so you can restore it.`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                Back to editing
              </Button>
              <Button disabled={!canPublish} onClick={() => void submit()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Publish v{next}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CheckChip({ tone, children }: { tone: 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? Check : AlertTriangle;
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'warning' && 'bg-warning/10 text-warning',
        tone === 'danger' && 'bg-danger/10 text-danger'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </li>
  );
}
