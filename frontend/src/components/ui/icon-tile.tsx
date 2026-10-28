import { cn } from '@/lib/utils';

/** A small app-icon tile set inline with display type; sized in em so it follows the heading. */
export function IconTile({ tone = 'ink', className, children }: { tone?: 'ink' | 'highlight'; className?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mx-[0.08em] inline-grid h-[0.92em] w-[0.92em] place-items-center rounded-[0.22em] align-[-0.1em] [&_svg]:h-[52%] [&_svg]:w-[52%] [&_svg]:stroke-[2.4]',
        tone === 'ink' ? 'bg-foreground text-highlight theater:bg-highlight theater:text-highlight-foreground' : 'bg-highlight text-highlight-foreground',
        className
      )}
    >
      {children}
    </span>
  );
}
