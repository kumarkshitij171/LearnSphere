'use client';

import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { adminOrdersApi, getApiErrorMessage, type Order } from '@/lib/api';
import { formatMinor, toMinorUnits } from '@/lib/money';
import { cn } from '@/lib/utils';

/** Full or partial refund with a reason for the audit trail — never a window.prompt. */
export function RefundDialog({ order, onClose, onRefunded }: { order: Order | null; onClose: () => void; onRefunded: () => void }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode('full');
    setAmount('');
    setReason('');
    setError(null);
  }, [order]);

  if (!order) return null;
  const remaining = order.amountMinor - (order.refundedMinor ?? 0);
  const partialMinor = amount ? toMinorUnits(Number(amount), order.currency) : 0;
  const amountProblem =
    mode === 'partial'
      ? !amount
        ? 'Enter an amount.'
        : !(partialMinor > 0)
          ? 'Enter a positive amount.'
          : partialMinor > remaining
            ? `At most ${formatMinor(remaining, order.currency)} can still be refunded.`
            : null
      : null;
  const reasonProblem = reason.trim().length < 3 ? 'A short reason is required — it goes on the audit trail.' : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminOrdersApi.refund(order.orderId, {
        ...(mode === 'partial' ? { amountMinor: partialMinor } : {}),
        reason: reason.trim(),
      });
      toast.success('Refund issued', {
        description: `${formatMinor(mode === 'partial' ? partialMinor : remaining, order.currency)} for “${order.courseTitle}”.`,
      });
      onRefunded();
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e, 'The refund could not be issued.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund order</DialogTitle>
          <DialogDescription>
            {order.courseTitle}
            {order.userEmail ? ` · ${order.userEmail}` : ''} · paid {formatMinor(order.amountMinor, order.currency)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div role="radiogroup" aria-label="Refund amount" className="grid grid-cols-2 gap-2">
            {(['full', 'partial'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  mode === m ? 'border-primary/60 bg-surface' : 'border-border hover:border-foreground/20'
                )}
              >
                <span className="block text-sm font-semibold">{m === 'full' ? 'Everything left' : 'Part of it'}</span>
                <span className="block text-xs text-muted-foreground">
                  {m === 'full' ? formatMinor(remaining, order.currency) : 'Choose an amount'}
                </span>
              </button>
            ))}
          </div>
          {mode === 'partial' ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium">Amount ({order.currency})</span>
              <input
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => /^\d*(\.\d{0,2})?$/.test(e.target.value) && setAmount(e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-foreground/[0.03] px-3 text-sm tabular-nums focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              />
              {amount && amountProblem ? <span className="text-xs text-danger">{amountProblem}</span> : null}
            </label>
          ) : null}
          <label className="block space-y-2">
            <span className="text-sm font-medium">Reason</span>
            <Textarea
              value={reason}
              rows={3}
              maxLength={500}
              placeholder="e.g. Bought by mistake, asked within 24 hours"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">A full refund also removes the student&apos;s access to the course.</p>
          {error ? <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy || Boolean(amountProblem) || Boolean(reasonProblem)} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refund {mode === 'partial' && partialMinor > 0 ? formatMinor(partialMinor, order.currency) : formatMinor(remaining, order.currency)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
