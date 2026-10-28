'use client';

import { useEffect, useState } from 'react';
import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

/** One toaster for the app, drawn from the same tokens as everything else. */
export function Toaster() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-look') === 'theater');
    read();
    window.addEventListener('ls-look', read);
    return () => window.removeEventListener('ls-look', read);
  }, []);
  return (
    <Sonner
      theme={dark ? 'dark' : 'light'}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'group !rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-overlay !font-sans',
          title: '!font-medium',
          description: '!text-muted-foreground',
          actionButton: '!rounded-full !bg-primary !font-medium !text-primary-foreground',
          cancelButton: '!rounded-full !bg-surface !text-foreground',
          closeButton: '!border-border !bg-popover !text-muted-foreground hover:!text-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
        },
      }}
    />
  );
}
