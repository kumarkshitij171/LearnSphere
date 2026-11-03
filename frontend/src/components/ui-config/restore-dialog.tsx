'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '@/lib/api';

/** Restoring publishes the old configuration as a new version; nothing is deleted and the draft is left alone. */
export function RestoreDialog({
  version,
  liveVersion,
  onClose,
  onRestore,
}: {
  version: number | null;
  liveVersion: number;
  onClose: () => void;
  onRestore: (version: number, message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (version !== null) {
      setMessage(`Restore v${version}`);
      setError(null);
    }
  }, [version]);

  const submit = async () => {
    if (version === null || message.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await onRestore(version, message.trim());
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e, 'The version could not be restored.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={version !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Restore v{version}?</DialogTitle>
          <DialogDescription>
            This publishes v{version}&apos;s configuration as v{liveVersion + 1}. Nothing is deleted: v{liveVersion} stays in the history, and your draft is not touched.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor="restore-message">Version message</Label>
          <Textarea id="restore-message" rows={2} maxLength={200} value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} />
          {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || message.trim().length < 3} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restore and publish v{liveVersion + 1}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
