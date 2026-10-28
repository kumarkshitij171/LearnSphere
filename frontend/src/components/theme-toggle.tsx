'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyLook, readPreference, resolveLook, savePreference, type Look, type LookPreference } from '@/lib/look';
import { themeLook, useUiConfig } from '@/lib/ui-config';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: LookPreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function useLookPreference() {
  const { theme } = useUiConfig();
  const fallback: Look = themeLook(theme);
  const [pref, setPref] = useState<LookPreference | null>(null);

  useEffect(() => setPref(readPreference()), []);

  // follow the OS while the choice is "system"
  useEffect(() => {
    if (pref !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => applyLook(resolveLook('system', fallback));
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [pref, fallback]);

  const choose = (next: LookPreference) => {
    savePreference(next);
    setPref(next);
    applyLook(resolveLook(next, fallback));
  };

  const current: LookPreference = pref ?? (fallback === 'theater' ? 'dark' : 'light');
  return { current, choose };
}

/** Light / Dark / System as a small segmented control, for menus and settings. */
export function ThemeSegmented({ className }: { className?: string }) {
  const { current, choose } = useLookPreference();
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn('flex items-center gap-0.5 rounded-full bg-surface p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          onClick={() => choose(value)}
          title={label}
          className={cn(
            'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
            current === value
              ? 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)),0_1px_2px_rgb(17_17_19/0.06)]'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** One icon button that flips between light and dark; for headers with no room for a menu. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { current, choose } = useLookPreference();
  const [look, setLook] = useState<Look>('studio');

  useEffect(() => {
    const read = () => setLook(document.documentElement.getAttribute('data-look') === 'theater' ? 'theater' : 'studio');
    read();
    window.addEventListener('ls-look', read);
    return () => window.removeEventListener('ls-look', read);
  }, [current]);

  const dark = look === 'theater';
  return (
    <button
      type="button"
      onClick={() => choose(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-full text-body transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        className
      )}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
