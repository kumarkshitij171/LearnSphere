'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** shown in the tooltip, e.g. "Pause (k)" */
  shortcut?: string;
  tooltipAlign?: 'start' | 'center' | 'end';
  pressed?: boolean;
}

/** A round icon button with a tooltip that names its shortcut, the way YouTube's controls do. */
export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(function ControlButton(
  { label, shortcut, tooltipAlign = 'center', pressed, className, children, ...rest },
  ref
) {
  // an open menu replaces the tooltip; showing both stacks them on top of each other
  const expanded = rest['aria-expanded'] === true || rest['aria-expanded'] === 'true';
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'group/btn relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-white outline-none transition-colors',
        'hover:bg-white/10 focus-visible:bg-white/15 focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-95',
        className
      )}
      {...rest}
    >
      {children}
      {expanded ? null : <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full mb-3 whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-150',
          'group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100',
          tooltipAlign === 'end' ? 'right-0' : tooltipAlign === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2'
        )}
      >
        {label}
        {shortcut ? <span className="ml-1 text-white/55">({shortcut})</span> : null}
      </span>}
    </button>
  );
});

/** The translucent rounded group the controls sit in. */
export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center rounded-full bg-black/45 p-0.5 shadow-lg ring-1 ring-white/10 backdrop-blur-md', className)}>
      {children}
    </div>
  );
}
