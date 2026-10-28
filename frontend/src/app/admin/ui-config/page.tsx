'use client';

import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { ConfigWorkbench } from '@/components/ui-config/config-workbench';

/**
 * Admin-only. The guard and the hidden nav item are convenience: every API this page calls is
 * rejected with 403 for anyone who is not an ADMIN.
 */
export default function UiConfigPage() {
  const { user, checking } = useRequireRole('ADMIN');

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <>
      <div data-look="theater" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground md:hidden">
        <MonitorSmartphone className="h-8 w-8" />
        <p>The configuration editor needs a wider screen. Open it on a laptop or desktop.</p>
      </div>
      <div data-look="theater" className="hidden md:block">
        <ConfigWorkbench user={user} />
      </div>
    </>
  );
}
