'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { inboxApi, type InboxItem } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { inAppPath, type PushState } from '@/lib/push';
import { cn } from '@/lib/utils';

const POLL_MS = 60_000;
export const INBOX_REFRESH_EVENT = 'ls-inbox-refresh';

/** The bell: the user's in-app messages, newest first, and the switch for browser push. */
export function NotificationInbox({
  push,
  pushBusy,
  pushTitle,
  onTogglePush,
}: {
  push: PushState;
  pushBusy: boolean;
  pushTitle: string;
  onTogglePush: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await inboxApi.list();
      setItems(page.items);
      setUnread(page.unread);
      setFailed(false);
    } catch {
      setFailed(true);
      setItems((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    const refresh = () => load();
    window.addEventListener(INBOX_REFRESH_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(INBOX_REFRESH_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((list) => list?.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? now } : i)) ?? list);
    setUnread((n) => (ids ? Math.max(0, n - ids.length) : 0));
    try {
      setUnread(await inboxApi.markRead(ids));
    } catch {
      load();
    }
  };

  const openItem = (item: InboxItem) => {
    if (!item.readAt) markRead([item.id]);
    const path = inAppPath(item.link);
    if (path) {
      setOpen(false);
      router.push(path);
    }
  };

  const pushLabel = {
    unsupported: 'Not supported in this browser',
    unconfigured: 'Not set up yet',
    denied: 'Blocked in browser settings',
    off: 'Off',
    on: 'On',
  }[push];
  const canToggle = push === 'on' || push === 'off';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative grid h-9 w-9 place-items-center rounded-full text-body transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 data-[state=open]:bg-surface"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-highlight px-1 font-mono text-[10px] font-semibold text-highlight-foreground shadow-[0_0_0_2px_hsl(var(--background))]">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="ui-popover z-50 flex max-h-[min(560px,calc(100vh-80px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-overlay outline-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">
              Notifications {unread ? <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{unread} new</span> : null}
            </p>
            {unread ? (
              <button
                type="button"
                onClick={() => markRead()}
                className="rounded-md text-[13px] font-medium text-body transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items === null ? (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length ? (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={cn(
                        'grid w-full grid-cols-[10px_minmax(0,1fr)] gap-x-3 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none',
                        !item.readAt && 'bg-highlight/[0.08]'
                      )}
                    >
                      <span aria-hidden className={cn('mt-1.5 h-2 w-2 rounded-[2px]', item.readAt ? 'bg-transparent' : 'bg-highlight shadow-[0_0_0_1px_hsl(var(--foreground)/0.15)]')} />
                      <span className="min-w-0 space-y-0.5">
                        <span className={cn('block truncate text-sm', item.readAt ? 'font-medium text-body' : 'font-semibold')}>{item.title}</span>
                        {item.body ? <span className="line-clamp-2 block text-[13px] text-body">{item.body}</span> : null}
                        <span className="block text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-1 px-4 py-10 text-center">
                <p className="text-sm font-medium">{failed ? 'Notifications are unavailable' : "You're all caught up"}</p>
                <p className="text-[13px] text-muted-foreground">
                  {failed ? 'The notification service did not answer. Try again in a minute.' : 'Receipts and updates about your courses appear here.'}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-body" title={pushTitle}>
              {push === 'on' ? <BellRing className="h-4 w-4 shrink-0" /> : <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="truncate">
                Browser push · <span className="text-muted-foreground">{pushLabel}</span>
              </span>
            </span>
            {canToggle ? (
              <button
                type="button"
                onClick={onTogglePush}
                disabled={pushBusy}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition-colors hover:bg-surface disabled:opacity-50"
              >
                {pushBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {push === 'on' ? 'Turn off' : 'Turn on'}
              </button>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
