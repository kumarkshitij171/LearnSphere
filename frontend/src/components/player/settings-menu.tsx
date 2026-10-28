'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Gauge, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { qualityLabel } from './prefs';
import { RATES } from './shortcuts';
import type { QualityLevel } from './use-hls';

type Page = 'main' | 'speed' | 'quality';

interface SettingsMenuProps {
  rate: number;
  onRate: (rate: number) => void;
  levels: QualityLevel[];
  selected: number;
  active: number;
  onLevel: (index: number) => void;
  /** Safari's native HLS picks quality itself — the row is hidden there */
  qualityAvailable: boolean;
  onClose: () => void;
}

const rateName = (r: number) => (r === 1 ? 'Normal' : `${r}×`);

export function SettingsMenu({ rate, onRate, levels, selected, active, onLevel, qualityAvailable, onClose }: SettingsMenuProps) {
  const [page, setPage] = useState<Page>('main');
  const ref = useRef<HTMLDivElement>(null);

  const activeLevel = levels.find((l) => l.index === active);
  const selectedLevel = levels.find((l) => l.index === selected);
  const qualitySummary =
    selected === -1
      ? `Auto${activeLevel ? ` (${qualityLabel(activeLevel.short, activeLevel.frameRate).name})` : ''}`
      : selectedLevel
        ? qualityLabel(selectedLevel.short, selectedLevel.frameRate).name
        : 'Auto';

  // focus the first item whenever a page opens, so the keyboard lands somewhere useful
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-item]')?.focus();
  }, [page]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-item]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      next?.focus();
    } else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && page !== 'main')) {
      e.preventDefault();
      if (page === 'main') onClose();
      else setPage('main');
    }
    // the player's shortcuts must not fire while the menu has focus
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Settings"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-full right-0 z-30 mb-3 w-64 origin-bottom-right player-pop overflow-hidden rounded-2xl bg-neutral-950/90 py-2 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
    >
      {page === 'main' ? (
        <>
          <MenuRow icon={<Gauge className="h-[18px] w-[18px]" />} label="Playback speed" value={rateName(rate)} onClick={() => setPage('speed')} />
          {qualityAvailable && levels.length > 0 ? (
            <MenuRow
              icon={<SlidersHorizontal className="h-[18px] w-[18px]" />}
              label="Quality"
              value={qualitySummary}
              onClick={() => setPage('quality')}
            />
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            data-item
            onClick={() => setPage('main')}
            className="mb-1 flex w-full items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1 text-left font-medium outline-none hover:bg-white/5 focus-visible:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" /> {page === 'speed' ? 'Playback speed' : 'Quality'}
          </button>
          <div className="max-h-72 overflow-y-auto">
            {page === 'speed'
              ? RATES.map((r) => (
                  <Choice key={r} checked={Math.abs(rate - r) < 1e-9} onClick={() => { onRate(r); setPage('main'); }}>
                    {rateName(r)}
                  </Choice>
                ))
              : (
                <>
                  {levels.map((l) => {
                    const q = qualityLabel(l.short, l.frameRate);
                    return (
                      <Choice key={l.index} checked={selected === l.index} onClick={() => { onLevel(l.index); setPage('main'); }}>
                        {q.name}
                        {q.badge ? (
                          <sup className="ml-1 rounded bg-highlight/15 px-1 py-px text-[10px] font-semibold not-italic text-highlight">{q.badge}</sup>
                        ) : null}
                      </Choice>
                    );
                  })}
                  <Choice checked={selected === -1} onClick={() => { onLevel(-1); setPage('main'); }}>
                    Auto
                    {activeLevel && selected === -1 ? (
                      <span className="ml-1.5 text-white/50">({qualityLabel(activeLevel.short, activeLevel.frameRate).name})</span>
                    ) : null}
                  </Choice>
                </>
              )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-item
      aria-haspopup="menu"
      onClick={onClick}
      onKeyDown={(e) => e.key === 'ArrowRight' && onClick()}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.07] focus-visible:bg-white/10"
    >
      <span className="text-white/80">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="text-white/60">{value}</span>
      <ChevronRight className="h-4 w-4 text-white/50" />
    </button>
  );
}

function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      data-item
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-white/[0.07] focus-visible:bg-white/10',
        checked && 'text-highlight'
      )}
    >
      <Check className={cn('h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
      <span className="flex items-baseline">{children}</span>
    </button>
  );
}
