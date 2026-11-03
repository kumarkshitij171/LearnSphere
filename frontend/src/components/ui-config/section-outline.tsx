'use client';

import { cn } from '@/lib/utils';

/** The config's top-level keys; a dot marks the ones the draft changes. Click jumps the editor there. */
export function SectionOutline({
  sections,
  changed,
  active,
  onSelect,
  className,
}: {
  sections: string[];
  changed: string[];
  active: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Sections" className={cn('flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0', className)}>
      <p className="hidden px-2.5 pb-1.5 text-[12px] font-medium text-muted-foreground lg:block">Sections</p>
      {sections.map((key) => {
        const isChanged = changed.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-current={active === key ? 'location' : undefined}
            className={cn(
              'flex h-8 shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 text-left font-mono text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              active === key ? 'bg-surface text-foreground' : 'text-body hover:bg-surface hover:text-foreground'
            )}
          >
            <span className="truncate">{key}</span>
            {isChanged ? (
              <>
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                <span className="sr-only">(changed in your draft)</span>
              </>
            ) : null}
          </button>
        );
      })}
      <p className="hidden px-2.5 pt-2 text-[12px] leading-snug text-muted-foreground lg:block">Blue dots mark the sections your draft changes.</p>
    </nav>
  );
}
