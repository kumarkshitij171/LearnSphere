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
    <div className={cn('rounded-[14px] border border-border p-4', className)}>
      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        {label}
        {icon ? <span className="text-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      </div>
      <div className="mt-2 font-mono text-title tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
