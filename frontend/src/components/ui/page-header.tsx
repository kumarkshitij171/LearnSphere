import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  trail,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** the second tone after the title */
  trail?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? <div className="text-[13px] text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-display-m text-balance">
          {title}
          {trail ? <span className="text-subtle"> {trail}</span> : null}
        </h1>
        {description ? <div className="max-w-2xl text-sm text-body">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
