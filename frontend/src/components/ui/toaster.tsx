'use client';

import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

/** One toaster for the app, in its dark palette. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-xl !border !border-white/10 !bg-[hsl(240_8%_9%)] !text-foreground !shadow-[0_16px_48px_-12px_rgba(0,0,0,0.8)]',
          title: '!font-semibold',
          description: '!text-muted-foreground',
          actionButton: '!rounded-md !bg-primary !font-semibold !text-primary-foreground',
          cancelButton: '!rounded-md !bg-white/10 !text-foreground',
          closeButton: '!border-white/10 !bg-[hsl(240_8%_12%)] !text-muted-foreground hover:!text-foreground',
          success: '[&_[data-icon]]:!text-emerald-300',
          error: '[&_[data-icon]]:!text-red-300',
        },
      }}
    />
  );
}
