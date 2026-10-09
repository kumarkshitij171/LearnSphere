'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  /** the user must type this (e.g. the course title) before a destructive action unlocks */
  requireText?: string;
  /** runs while the dialog shows a spinner; a thrown error keeps it open and shows the message */
  action?: () => Promise<void>;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** The app's replacement for window.confirm(): `const confirm = useConfirm(); if (await confirm({...}))`. */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm needs <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setError(null);
        setBusy(false);
        setPending({ ...options, resolve });
      }),
    []
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const onConfirm = async () => {
    if (!pending) return;
    if (!pending.action) return close(true);
    setBusy(true);
    setError(null);
    try {
      await pending.action();
      close(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const locked = Boolean(pending?.requireText && typed.trim() !== pending.requireText.trim());
  const danger = pending?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && !busy && close(false)}>
        <DialogContent size="sm" hideClose>
          <DialogHeader className="pr-6">
            <div className="flex items-start gap-3">
              {danger ? (
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-300 ring-1 ring-red-500/20">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              ) : null}
              <div className="space-y-1.5">
                <DialogTitle>{pending?.title}</DialogTitle>
                {pending?.description ? <DialogDescription asChild><div>{pending.description}</div></DialogDescription> : null}
              </div>
            </div>
          </DialogHeader>
          {pending?.requireText || error ? (
            <DialogBody className="space-y-3 pt-2">
              {pending?.requireText ? (
                <label className="block space-y-2 text-sm">
                  <span className="text-muted-foreground">
                    Type <span className="font-semibold text-foreground">{pending.requireText}</span> to confirm
                  </span>
                  <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                </label>
              ) : null}
              {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={danger ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy || locked} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
