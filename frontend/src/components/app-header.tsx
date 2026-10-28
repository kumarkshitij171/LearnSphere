'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand';
import { RoleBadge } from '@/components/role-badge';
import { LogOut, Loader2 } from 'lucide-react';
import { usersApi, type CurrentUser } from '@/lib/api';

export function AppHeader({ user }: { user: CurrentUser | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await usersApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      router.push('/login');
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-3">
          {user?.role ? <RoleBadge role={user.role} /> : null}
          <Button variant="outline" onClick={handleLogout} disabled={loggingOut} className="gap-2">
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
