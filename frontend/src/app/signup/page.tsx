'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpInput } from '@/components/ui/otp-input';
import { AuthShell } from '@/components/auth-shell';
import { useGuestOnly } from '@/hooks/useGuestOnly';
import { usersApi, getApiErrorMessage } from '@/lib/api';
import {
  Loader2,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  ArrowLeft,
  MailCheck,
} from 'lucide-react';

// Mirrors the backend password rules (utils/passwordValidation.ts).
const passwordRules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  {
    label: 'One special character',
    test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
  },
];

type Step = 'register' | 'verify';

export default function SignupPage() {
  const router = useRouter();
  const checkingSession = useGuestOnly();
  const [step, setStep] = useState<Step>('register');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Verify step
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendNote, setResendNote] = useState<string | null>(null);

  const passwordChecks = useMemo(
    () => passwordRules.map((r) => ({ ...r, ok: r.test(formData.password) })),
    [formData.password]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (!/^[a-zA-Z\s]+$/.test(formData.name.trim())) {
      newErrors.name = 'Name can only contain letters and spaces';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!passwordRules.every((r) => r.test(formData.password))) {
      newErrors.password = 'Password does not meet all the requirements below';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsLoading(true);
    try {
      // Register sets an httpOnly activation `token` cookie and emails a 6-digit OTP.
      await usersApi.register({
        name: formData.name.trim(),
        email: formData.email,
        password: formData.password,
      });
      setStep('verify');
      setOtp('');
      setOtpError(null);
    } catch (error) {
      console.error('Signup error:', error);
      setApiError(
        getApiErrorMessage(
          error,
          'Something went wrong while creating your account.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (code?: string) => {
    const value = code ?? otp;
    setOtpError(null);
    if (!/^\d{6}$/.test(value)) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }

    setVerifying(true);
    try {
      // Token travels via the httpOnly cookie set at registration (withCredentials).
      await usersApi.verify({ otp: value });
      router.push('/dashboard');
    } catch (error) {
      console.error('Verify error:', error);
      setOtpError(
        getApiErrorMessage(error, 'Invalid or expired code. Please try again.')
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResendState('sending');
    setResendNote(null);
    try {
      // re-registering an existing account fails with "User already exists"; resending is its own endpoint
      const { data } = await usersApi.reverifyEmail(formData.email);
      setResendState('sent');
      setResendNote(data?.message ?? 'A new code has been sent to your email.');
    } catch (error) {
      setResendState('idle');
      setResendNote(
        getApiErrorMessage(
          error,
          'Could not resend the code. Please check your inbox or spam folder.'
        )
      );
    }
  };

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (step === 'verify') {
    return (
      <AuthShell>
        <button
          type="button"
          onClick={() => setStep('register')}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-surface">
          <MailCheck className="h-7 w-7 text-foreground" />
        </div>

        <div className="mt-6 space-y-2">
          <h1 className="text-display-m">
            Verify your email
          </h1>
          <p className="text-muted-foreground">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-foreground">{formData.email}</span>.
            Enter it below to activate your account.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <OtpInput
            value={otp}
            onChange={setOtp}
            length={6}
            hasError={!!otpError}
            disabled={verifying}
            onComplete={(code) => handleVerify(code)}
          />

          {otpError && (
            <div className="flex items-start gap-2 rounded-[10px] bg-danger/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{otpError}</span>
            </div>
          )}
          {resendNote && !otpError && (
            <p className="text-sm text-muted-foreground">{resendNote}</p>
          )}

          <Button
            onClick={() => handleVerify()}
            disabled={verifying || otp.length < 4}
            className="h-11 w-full"
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

          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t get the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === 'sending'}
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Sending...' : 'Resend'}
            </button>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-display-m">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Sign in
          </Link>
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleRegister}>
        {apiError && (
          <div className="flex items-start gap-2 rounded-[10px] bg-danger/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <span>{apiError}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              className={`pl-10 ${errors.name ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
            />
          </div>
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={`pl-10 ${errors.email ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a strong password"
              className={`pl-10 pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password}</p>
          )}

          {formData.password && (
            <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {passwordChecks.map((c) => (
                <li
                  key={c.label}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    c.ok ? 'text-success' : 'text-muted-foreground'
                  }`}
                >
                  {c.ok ? (
                    <Check className="h-3.5 w-3.5 flex-none" strokeWidth={3} />
                  ) : (
                    <X className="h-3.5 w-3.5 flex-none opacity-60" />
                  )}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter your password"
              className={`pl-10 ${errors.confirmPassword ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" disabled={isLoading} className="h-11 w-full">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthShell>
  );
}
