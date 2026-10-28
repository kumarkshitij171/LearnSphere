'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

/** A segmented control: a surface track with the active tab raised. */
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-surface p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors',
        'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgb(17_17_19/0.08),0_0_0_1px_hsl(var(--border))]',
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />;
}
