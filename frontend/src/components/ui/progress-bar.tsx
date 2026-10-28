import { cn } from '@/lib/utils';

/** A thin bar: ink on surface. `value` is 0..1. */
export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface', className)}
    >
      <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
