import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex w-full resize-none rounded-[10px] border border-transparent bg-surface px-3 py-2 text-sm text-foreground transition-colors placeholder:text-subtle hover:bg-foreground/[0.06] focus-visible:border-foreground/25 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
);
