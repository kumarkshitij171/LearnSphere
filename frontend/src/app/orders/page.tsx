'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Play, Receipt, RotateCcw, Wallet } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCover } from '@/components/course-cover';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { toast } from '@/components/ui/toaster';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ordersApi, getApiErrorMessage, type Order } from '@/lib/api';
import { formatMinor } from '@/lib/money';

const PAGE_SIZE = 20;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const PROVIDER_LABEL: Record<string, string> = {
  RAZORPAY: 'Razorpay',
  STRIPE: 'Card (Stripe)',
  MOCK: 'Test payment',
  NONE: 'Free enrolment',
};

const ACCESS = new Set(['PAID', 'PARTIALLY_REFUNDED']);

export default function PurchasesPage() {
  const { user, checking } = useRequireAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setError(null);
    try {
      const result = await ordersApi.list(p, PAGE_SIZE);
      setOrders(result.orders);
      setTotal(result.total);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load your purchases.'));
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    if (user) load(page);
  }, [user, page, load]);

  if (checking || !user) return <main className="min-h-screen bg-background" />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const owned = (orders ?? []).filter((o) => ACCESS.has(o.status)).length;
  // per currency: never add rupees to dollars
  const spent = Object.entries(
    (orders ?? [])
      .filter((o) => ACCESS.has(o.status) || o.status === 'REFUNDED')
      .reduce<Record<string, number>>((acc, o) => {
        acc[o.currency] = (acc[o.currency] ?? 0) + o.amountMinor - (o.refundedMinor ?? 0);
        return acc;
      }, {})
  );

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Order number copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader title="Purchases" description="Your receipts and the courses they unlocked." />

        {orders && orders.length ? (
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Courses owned" value={owned} icon={<Play />} />
            <StatCard
              label="Total spent"
              value={spent.length ? spent.map(([cur, minor]) => formatMinor(minor, cur)).join(' + ') : formatMinor(0, 'INR')}
              hint="after refunds"
              icon={<Wallet />}
            />
          </div>
        ) : null}

        {orders === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Receipt />}
            title="We couldn't load your purchases"
            description={error}
            action={
              <Button variant="outline" onClick={() => load(page)} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Try again
              </Button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="No purchases yet"
            description="Courses you buy or enrol in will show up here, with their receipts."
            action={
              <Button asChild>
                <Link href="/explore">Explore courses</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.orderId} className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-card/40 p-4 sm:flex-row sm:items-center">
                <Link href={`/courses/${o.courseId}`} className="shrink-0">
                  <CourseCover id={o.courseId} title={o.courseTitle} size="sm" className="aspect-video w-full rounded-xl ring-1 ring-white/10 sm:w-36" />
                </Link>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/courses/${o.courseId}`} className="truncate font-semibold hover:underline">
                      {o.courseTitle}
                    </Link>
                    <OrderStatusBadge status={o.status} amountMinor={o.amountMinor} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {fmtDate(o.paidAt ?? o.createdAt)} · {PROVIDER_LABEL[o.provider] ?? o.provider}
                  </p>
                  {o.refundedMinor ? (
                    <p className="text-xs text-sky-200">{formatMinor(o.refundedMinor, o.currency)} refunded to your original payment method</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => copyId(o.orderId)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    title="Copy order number"
                  >
                    Order <span className="font-mono">#{o.orderId.slice(0, 8)}</span> <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                  <span className="font-display text-lg font-bold tabular-nums">
                    {o.amountMinor === 0 ? 'Free' : formatMinor(o.amountMinor, o.currency)}
                  </span>
                  {ACCESS.has(o.status) ? (
                    <Button asChild size="sm" className="gap-1.5">
                      <Link href={`/courses/${o.courseId}`}>
                        <Play className="h-3.5 w-3.5 fill-current" /> Watch
                      </Link>
                    </Button>
                  ) : o.status === 'PENDING' || o.status === 'FAILED' ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/courses/${o.courseId}`}>{o.status === 'PENDING' ? 'Resume payment' : 'Try again'}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
