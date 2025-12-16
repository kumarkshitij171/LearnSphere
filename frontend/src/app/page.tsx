'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const baseURL =
          process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

        // Use refresh-token endpoint to validate cookies / tokens.
        await axios.post(
          `${baseURL}/api/v1/users/refresh-token`,
          {},
          { withCredentials: true }
        );
        setAuthError(null);
      } catch (error) {
        setAuthError('You are not authenticated. Redirecting to login...');
        router.replace('/login');
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      const baseURL =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

      await axios.get(`${baseURL}/api/v1/users/logout`, {
        withCredentials: true,
      });
    } catch (error) {
      // Even if logout fails, push to login to avoid trapping the user.
      console.error('Logout error:', error);
    } finally {
      router.push('/login');
    }
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Checking authentication...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
        {authError && (
          <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2 inline-block">
            {authError}
          </p>
        )}
        <p className="text-muted-foreground">
          You are signed in. This page is protected by a token check against the
          backend.
        </p>
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>
    </main>
  );
}
