'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi, type CurrentUser, type Role } from '@/lib/api';

// Protect a page that needs a session. Redirects to /login if unauthenticated.
export function useRequireAuth() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await usersApi.getCurrentUser();
        if (!active) return;
        if (!u) {
          router.replace('/login');
          return;
        }
        setUser(u);
        setChecking(false);
      } catch {
        if (active) router.replace('/login');
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return { user, checking };
}

// Protect a page that needs a specific role; sends others back to /dashboard.
export function useRequireRole(roles: Role | Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const { user, checking } = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (!checking && user && !allowed.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [user, checking, router, allowed]);

  return { user, checking: checking || (!!user && !allowed.includes(user.role)) };
}
