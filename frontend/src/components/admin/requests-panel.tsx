'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { adminApi, getApiErrorMessage, type InstructorRequest } from '@/lib/api';
import { relativeTime } from '@/lib/format';

export function RequestsPanel({ onChange }: { onChange?: (pending: number) => void }) {
  const confirm = useConfirm();
  const [requests, setRequests] = useState<InstructorRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await adminApi.listInstructorRequests('PENDING').catch(() => []);
    setRequests(list);
    onChange?.(list.length);
  }, [onChange]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (r: InstructorRequest, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const ok = await confirm({
        title: `Decline ${r.user?.name || 'this request'}?`,
        description: 'They stay a student and can apply again later.',
        confirmLabel: 'Decline',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(r.id);
    try {
      await (action === 'approve' ? adminApi.approveRequest(r.id) : adminApi.rejectRequest(r.id));
      toast.success(action === 'approve' ? `${r.user?.name || 'They'} can now teach` : 'Request declined');
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Could not update the request.'));
    } finally {
      setBusyId(null);
    }
  };

  if (requests === null) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (requests.length === 0) {
    return <EmptyState icon={<Inbox />} title="No pending requests" description="When students apply to teach, they appear here." />;
  }
  return (
    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.08]">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{r.user?.name || 'Unknown user'}</p>
            <p className="text-xs text-muted-foreground">
              {r.user?.email} · applied {relativeTime(r.createdAt)}
            </p>
            {r.message ? <p className="mt-1.5 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-foreground/85">{r.message}</p> : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => act(r, 'reject')} disabled={busyId === r.id} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Decline
            </Button>
            <Button size="sm" onClick={() => act(r, 'approve')} disabled={busyId === r.id} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
