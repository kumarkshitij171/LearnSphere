'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { OtpInput } from '@/components/ui/otp-input';
import { AuthShell } from '@/components/auth-shell';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';
import { usersApi, getApiErrorMessage } from '@/lib/api';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The activation email links to /verify?otp=XXXX&token=YYYY
  const tokenFromUrl = (searchParams.get('token') || '').trim();
  const otpFromUrl = (searchParams.get('otp') || '').replace(/\D/g, '').slice(0, 4);
  const email = (searchParams.get('email') || '').trim();

  const [otp, setOtp] = useState(otpFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const attempted = useRef(false);

  const verify = async (code: string) => {
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    try {
      // token comes from the URL when present, otherwise from the httpOnly cookie.
      await usersApi.verify(
        tokenFromUrl ? { otp: code, token: tokenFromUrl } : { otp: code }
      );
      router.push('/dashboard');
    } catch (err) {
      console.error('Verify error:', err);
      setError(
        getApiErrorMessage(err, 'Invalid or expired code. Please try again.')
      );
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (!email) {
      setError('Go back to sign in and try again to resend the code.');
      return;
    }
    setError(null);
    setResending(true);
    try {
      const { data } = await usersApi.reverifyEmail(email);
      setResent(data?.message ?? 'A fresh code is on its way to your inbox.');
    } catch (err) {
      console.error('Resend error:', err);
      setError(
        getApiErrorMessage(err, 'Could not resend the code. Please try again.')
      );
    } finally {
      setResending(false);
    }
  };

  // Auto-verify when the email link already carries a full 6-digit code.
  useEffect(() => {
    if (!attempted.current && otpFromUrl.length === 6) {
      attempted.current = true;
      verify(otpFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/30">
        <MailCheck className="h-7 w-7 text-primary" />
      </div>

      <div className="mt-6 space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Verify your account
        </h1>
        <p className="text-muted-foreground">
          Enter the 6-digit activation code we emailed you to finish setting up
          your account.
        </p>
      </div>

      <div className="mt-8 space-y-5">
        <OtpInput
          value={otp}
          onChange={setOtp}
          length={6}
          hasError={!!error}
          disabled={verifying}
          onComplete={(code) => verify(code)}
        />

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={() => verify(otp)}
          disabled={verifying || otp.length < 4}
          className="h-11 w-full text-base"
        >
          {verifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify & continue'
          )}
        </Button>

        {resent && (
          <p className="text-center text-sm text-emerald-400">{resent}</p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get the code?{' '}
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="font-medium text-primary transition-colors hover:underline disabled:opacity-60"
          >
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </p>

        <p className="text-center text-sm text-muted-foreground">
          Entered the wrong email?{' '}
          <Link
            href="/signup"
            className="font-medium text-primary transition-colors hover:underline"
          >
            Sign up again
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
