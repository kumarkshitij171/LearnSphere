'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/lib/api';

/**
 * Guards "guest-only" pages (login, signup). If the visitor already has a valid
 * session it redirects them to the dashboard instead of showing the form.
 *
 * Returns `true` while the session check is in flight so the page can render a
 * loader and avoid flashing the form to an already-authenticated user.
 */
export function useGuestOnly(redirectTo = '/dashboard') {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        await usersApi.getCurrentUser();
        // Already signed in — keep `checking` true so the form never flashes,
        // and send them to the protected area.
        if (active) router.replace(redirectTo);
      } catch {
        // Not authenticated — let the page render.
        if (active) setChecking(false);
      }
    };

    check();

    return () => {
      active = false;
    };
  }, [router, redirectTo]);

  return checking;
}
