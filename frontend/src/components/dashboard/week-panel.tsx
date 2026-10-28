'use client';

import { useEffect, useState } from 'react';
import { formatWatched, loadActivity, weekSummary, type WeekSummary } from '@/lib/activity';
import { cn } from '@/lib/utils';

const BAR_MAX = 76;

/** Minutes actually played this week, per day. Local to this browser until progress moves server-side. */
export function WeekPanel({ userId, className, hideWhenEmpty }: { userId: string; className?: string; hideWhenEmpty?: boolean }) {
  const [week, setWeek] = useState<WeekSummary | null>(null);
  useEffect(() => setWeek(weekSummary(loadActivity(userId))), [userId]);

  const peak = Math.max(1, ...(week?.days.map((d) => d.seconds) ?? [1]));
  const empty = week ? week.totalSeconds === 0 && week.lessonsFinished === 0 : false;
  if (hideWhenEmpty && (week === null || empty)) return null;

  return (
    <section aria-labelledby="week-title" className={cn('flex flex-col gap-4 rounded-panel border border-border p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="week-title" className="text-[13px] text-muted-foreground">
          This week
        </h2>
        <span className="text-xs text-subtle" title="Watch time is kept in this browser">
          On this browser
        </span>
      </div>
      <p className="text-[34px] font-semibold leading-none tracking-[-0.04em]">
        {week ? formatWatched(week.totalSeconds) : '—'}
        <span className="ml-2 text-sm font-normal tracking-normal text-muted-foreground">watched</span>
      </p>
      <div className="grid h-[96px] grid-cols-7 items-end gap-2" role="img" aria-label="Minutes watched per day this week">
        {(week?.days ?? []).map((d) => (
          <div key={d.key} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span
              className={cn(
                'block w-full rounded-[4px]',
                d.seconds === 0 ? 'bg-border' : d.isToday ? 'bg-highlight shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.12)]' : 'bg-foreground'
              )}
              style={{ height: d.seconds === 0 ? 3 : Math.max(6, Math.round((d.seconds / peak) * BAR_MAX)) }}
              title={`${d.key}: ${formatWatched(d.seconds)}`}
            />
            <span className={cn('text-[11px]', d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-[13px] text-body">
        {empty ? (
          <span>Your week fills in as you watch.</span>
        ) : (
          <>
            <span>
              {week?.lessonsFinished ?? 0} {week?.lessonsFinished === 1 ? 'lesson' : 'lessons'} finished
            </span>
            <span className="tabular-nums">{week?.activeDays ?? 0} of 7 days</span>
          </>
        )}
      </div>
    </section>
  );
}
