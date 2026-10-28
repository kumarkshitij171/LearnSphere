'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Info, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiConfig } from '@/lib/ui-config';

const TONES = {
  info: { icon: Info, cls: 'border-info/20 bg-info/10 text-info' },
  success: { icon: CheckCircle2, cls: 'border-success/20 bg-success/10 text-success' },
  warning: { icon: AlertTriangle, cls: 'border-warning/25 bg-warning/10 text-warning' },
} as const;

/** Site-wide banner from config. Dismissal is per message, so a new announcement shows again. */
export function AnnouncementBanner() {
  const { announcement } = useUiConfig();
  const pathname = usePathname();
  const storageKey = `ls-announcement-dismissed:${announcement.message}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  // the config editor is a full-height workbench; the banner would push it off-screen
  if (pathname?.startsWith('/admin/ui-config')) return null;
  if (!announcement.enabled || !announcement.message || dismissed) return null;
  const tone = TONES[announcement.tone] ?? TONES.info;
  const Icon = tone.icon;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // private mode: dismissal lasts for this page only
    }
  };

  return (
    <div className={cn('relative z-[60] border-b px-4 py-2 text-sm', tone.cls)} role="status">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 pr-8 text-center">
        <Icon className="h-4 w-4 shrink-0" />
        {announcement.href ? (
          <Link href={announcement.href} className="underline-offset-4 hover:underline">
            {announcement.message}
          </Link>
        ) : (
          <span>{announcement.message}</span>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
