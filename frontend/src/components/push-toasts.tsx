'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/toaster';
import { INBOX_REFRESH_EVENT } from '@/components/notification-inbox';
import { inAppPath, listenForegroundPush, type ForegroundPush, type PushState } from '@/lib/push';

/** Shows a push that arrives while the app is open as a toast, with "Open" when it links somewhere. */
export function showPushToast(push: ForegroundPush, open: (path: string) => void) {
  const path = inAppPath(push.link);
  toast(push.title, {
    description: push.body || undefined,
    duration: 8000,
    action: path ? { label: 'Open', onClick: () => open(path) } : undefined,
  });
}

export function PushToasts({ state }: { state: PushState }) {
  const router = useRouter();
  useEffect(() => {
    if (state !== 'on') return;
    let stop = () => {};
    let cancelled = false;
    listenForegroundPush((push) => {
      showPushToast(push, (path) => router.push(path));
      window.dispatchEvent(new Event(INBOX_REFRESH_EVENT));
    })
      .then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)))
      .catch((e) => console.error('Foreground push listener failed:', e));
    return () => {
      cancelled = true;
      stop();
    };
  }, [state, router]);
  return null;
}
