import * as React from 'react';
import { cn } from '@/lib/utils';

/** Left-aligned inside its section: what is missing, one sentence, one action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-panel bg-surface px-6 py-7 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="mt-0.5 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span> : null}
        <div className="min-w-0 space-y-1">
          <p className="text-heading">{title}</p>
          {description ? <p className="max-w-prose text-sm text-body">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
