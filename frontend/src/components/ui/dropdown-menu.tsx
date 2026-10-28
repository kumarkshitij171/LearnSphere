'use client';

import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'ui-popover z-50 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-overlay',
          className
        )}
        {...props}
      />
    </Menu.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item> & { tone?: 'default' | 'danger' }
>(function DropdownMenuItem({ className, tone = 'default', ...props }, ref) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        tone === 'danger'
          ? 'text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger'
          : 'text-foreground data-[highlighted]:bg-surface',
        '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        className
      )}
      {...props}
    />
  );
});

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn('my-1 h-px bg-border', className)} />;
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Menu.Label className={cn('px-2.5 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
}
