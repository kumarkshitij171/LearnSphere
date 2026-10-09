import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset', {
  variants: {
    tone: {
      neutral: 'bg-white/[0.06] text-foreground/80 ring-white/10',
      primary: 'bg-primary/15 text-primary ring-primary/25',
      success: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
      warning: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
      danger: 'bg-red-500/10 text-red-300 ring-red-500/25',
      info: 'bg-sky-400/10 text-sky-300 ring-sky-400/25',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** a leading status dot */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
