import * as React from 'react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-white/[0.08] bg-card/60 p-4', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon ? <span className="text-muted-foreground/70 [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
