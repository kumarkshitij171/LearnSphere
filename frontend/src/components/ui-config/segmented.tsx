'use client';

import { cn } from '@/lib/utils';

/** A small toggle group drawn like TabsList, for switches that do not own a panel (Draft/Live, layout). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
            value === option.value
              ? 'bg-background text-foreground shadow-[0_1px_2px_rgb(17_17_19/0.08),0_0_0_1px_hsl(var(--border))]'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
