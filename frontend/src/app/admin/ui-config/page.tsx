'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { UiConfigPage } from '@/components/ui-config/ui-config-page';

/**
 * Admin-only. The guard and the hidden nav item are convenience: every API this page calls is
 * rejected with 403 for anyone who is not an ADMIN.
 */
export default function Page() {
  const { user, checking } = useRequireRole('ADMIN');

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <AppShell user={user}>
      <Suspense fallback={null}>
        <UiConfigPage user={user} />
      </Suspense>
    </AppShell>
  );
}
