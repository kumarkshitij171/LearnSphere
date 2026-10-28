'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Loader2, Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ordersApi,
  getApiErrorMessage,
  getApiErrorStatus,
  type CourseDetail,
  type Order,
  type PaymentProvider,
} from '@/lib/api';
import { env } from '@/config/env';
import { formatPrice } from '@/lib/money';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { pollUntil } from '@/lib/poll';
import { useUiConfig } from '@/lib/ui-config';

type Phase =
  | 'idle'
  | 'starting'
  | 'mock-checkout'
  | 'confirming'
  | 'confirm-slow'
  | 'unlocking'
  | 'unlock-slow'
  | 'failed'
  | 'error';

// Preference order when several providers are enabled.
const PREFERRED: PaymentProvider[] = ['RAZORPAY', 'STRIPE', 'MOCK'];

const CONFIRM_BUDGET_MS = 60_000;
const CONFIRM_SLOW_BUDGET_MS = 5 * 60_000;
const UNLOCK_BUDGET_MS = 10_000;

const newIntent = () => crypto.randomUUID();

/**
 * The buy flow for one course. The browser never decides that money moved: every path ends in
 * polling the order until the provider's webhook (or the sweeper) marks it PAID, then polling the
 * course until enrolment, granted from `order.paid`, shows up.
 */
export function BuyCourse({
  course,
  reloadCourse,
}: {
  course: CourseDetail;
  reloadCourse: () => Promise<CourseDetail>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { features, copy } = useUiConfig();
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [order, setOrder] = useState<Order | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // one purchase intent = one key, so a double click or a resumed checkout returns the same order
  const intentRef = useRef<string>(newIntent());
  const abortRef = useRef<AbortController | null>(null);

  const provider = providers?.length ? PREFERRED.find((p) => providers.includes(p)) ?? null : null;
  const free = !course.price;

  useEffect(() => {
    ordersApi.providers().then(setProviders).catch(() => setProviders([]));
    return () => abortRef.current?.abort();
  }, []);

  const signal = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  const unlock = useCallback(async () => {
    setPhase('unlocking');
    const unlocked = await pollUntil(reloadCourse, (c) => c.canAccessVideos, {
      intervalMs: 1000,
      timeoutMs: UNLOCK_BUDGET_MS,
      signal: signal(),
    });
    if (!unlocked) setPhase('unlock-slow');
  }, [reloadCourse]);

  const confirm = useCallback(
    async (orderId: string) => {
      setPhase('confirming');
      const isSettled = (o: Order) => o.status !== 'PENDING' && o.status !== 'CREATED';
      let settled = await pollUntil(() => ordersApi.get(orderId), isSettled, {
        intervalMs: 1500,
        timeoutMs: CONFIRM_BUDGET_MS,
        signal: signal(),
      });
      if (!settled) {
        // say so rather than spin: the webhook may be late, and the sweeper will catch up
        setPhase('confirm-slow');
        settled = await pollUntil(() => ordersApi.get(orderId), isSettled, {
          intervalMs: 5000,
          timeoutMs: CONFIRM_SLOW_BUDGET_MS,
          signal: abortRef.current?.signal,
        });
        if (!settled) return;
      }
      setOrder(settled);
      if (settled.status === 'PAID') return unlock();
      if (settled.status === 'FAILED') {
        setMessage('Your payment did not go through. No money was taken for that attempt.');
        return setPhase('failed');
      }
      intentRef.current = newIntent();
      setMessage(
        settled.status === 'EXPIRED'
          ? 'This checkout expired. Start again to buy the course.'
          : 'This checkout was cancelled.'
      );
      setPhase('error');
    },
    [unlock]
  );

  const openCheckout = useCallback(
    async (o: Order) => {
      setOrder(o);
      if (o.status === 'PAID') return unlock();
      if (o.status !== 'PENDING' || !o.checkout) return confirm(o.orderId);

      if (o.provider === 'RAZORPAY') {
        setPhase('starting');
        await openRazorpayCheckout(o, {
          onSubmitted: () => confirm(o.orderId),
          onDismissed: () => setPhase((p) => (p === 'starting' ? 'idle' : p)),
          onAttemptFailed: (reason) => setMessage(reason),
        });
        return;
      }
      if (o.provider === 'STRIPE') {
        const url = o.checkout.params?.url;
        if (typeof url !== 'string') throw new Error('This order has no Stripe checkout to open.');
        window.location.assign(url);
        return;
      }
      setPhase('mock-checkout');
    },
    [confirm, unlock]
  );

  // Returning from a redirect checkout (Stripe): resume watching the order named in the URL.
  useEffect(() => {
    const returning = searchParams.get('order');
    if (!returning || phase !== 'idle') return;
    router.replace(`/courses/${course.id}`);
    confirm(returning);
  }, [searchParams, phase, course.id, router, confirm]);

  const start = async () => {
    if (!provider && !free) return;
    setMessage(null);
    setPhase('starting');
    try {
      const created = await ordersApi.create({
        courseId: course.id,
        provider: provider ?? 'MOCK',
        idempotencyKey: intentRef.current,
      });
      await openCheckout(created);
    } catch (e) {
      if (getApiErrorStatus(e) === 409) {
        // already owned: the enrolment exists, so just show it
        await reloadCourse().catch(() => undefined);
      }
      setMessage(getApiErrorMessage(e, 'We could not start your purchase. Please try again.'));
      setPhase('error');
    }
  };

  const retry = async () => {
    if (!order) return start();
    setMessage(null);
    setPhase('starting');
    try {
      await openCheckout(await ordersApi.retry(order.orderId));
    } catch (e) {
      setMessage(getApiErrorMessage(e, 'We could not retry the payment.'));
      setPhase('error');
    }
  };

  const simulate = async (outcome: 'capture' | 'fail') => {
    if (!order?.checkout) return;
    try {
      await ordersApi.mockGateway(order.checkout.providerOrderId, outcome);
      await confirm(order.orderId);
    } catch (e) {
      setMessage(getApiErrorMessage(e, 'The mock gateway did not respond.'));
      setPhase('error');
    }
  };

  const busy = phase === 'starting' || phase === 'confirming' || phase === 'unlocking';
  const unavailable = providers !== null && !provider && !free;

  return (
    <Card variant="panel">
      <CardContent className="flex flex-col items-center gap-4 p-5 text-center">
        {phase === 'confirming' || phase === 'unlocking' ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">
              {phase === 'confirming' ? 'Confirming your payment…' : 'Payment received — unlocking your course…'}
            </p>
          </>
        ) : phase === 'confirm-slow' ? (
          <>
            <Clock className="h-8 w-8 text-warning" />
            <p className="max-w-md text-muted-foreground">
              We are still waiting for the payment provider to confirm. If you were charged, the course unlocks on
              its own within a few minutes — you can safely leave this page.
            </p>
          </>
        ) : phase === 'unlock-slow' ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="max-w-md text-muted-foreground">
              Payment received. Unlocking your course is taking longer than usual — refresh in a minute. Your receipt
              is on its way to your inbox.
            </p>
            <Button variant="outline" onClick={() => unlock()}>
              Check again
            </Button>
          </>
        ) : phase === 'mock-checkout' ? (
          <>
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Test checkout (mock gateway) — no real money moves.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => simulate('capture')}>Pay {formatPrice(course.price, course.currency)}</Button>
              <Button variant="outline" onClick={() => simulate('fail')}>
                Simulate a decline
              </Button>
            </div>
          </>
        ) : (
          <div className="w-full space-y-4 text-left">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {free ? 'Free course' : 'One-time purchase'}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {free ? 'Free' : formatPrice(course.price, course.currency)}
              </p>
            </div>
            {!features.purchases ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning ring-1 ring-warning/20">{copy.purchasesPaused}</p>
            ) : phase === 'failed' ? (
              <Button onClick={retry} className="h-11 w-full gap-2">
                <RotateCcw className="h-4 w-4" /> Try the payment again
              </Button>
            ) : (
              <Button onClick={start} disabled={busy || unavailable || providers === null} className="h-11 w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {free ? 'Enrol for free' : 'Buy now'}
              </Button>
            )}
            <ul className="space-y-2 text-sm text-muted-foreground">
              {['Lifetime access to every lesson', 'Watch on phone, tablet or desktop', 'Pick up exactly where you left off'].map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> {line}
                </li>
              ))}
            </ul>
            {unavailable ? (
              <p className="text-xs text-muted-foreground">Purchases are temporarily unavailable.</p>
            ) : null}
            {provider === 'MOCK' && env.isDevelopment ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                <Lock className="h-3 w-3" /> Test payments (mock gateway) in this environment.
              </p>
            ) : null}
          </div>
        )}

        {message ? (
          <div className="flex max-w-md items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
