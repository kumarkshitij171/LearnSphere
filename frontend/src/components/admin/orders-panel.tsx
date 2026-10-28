'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Receipt, Search } from 'lucide-react';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { adminOrdersApi, getApiErrorMessage, type Order, type OrderStatus } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { formatMinor } from '@/lib/money';
import { RefundDialog } from './refund-dialog';

const PAGE_SIZE = 20;
const FILTERS: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PENDING', label: 'Awaiting payment' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUND_PENDING', label: 'Refund pending' },
  { value: 'PARTIALLY_REFUNDED', label: 'Partly refunded' },
  { value: 'REFUNDED', label: 'Refunded' },
];
const REFUNDABLE: OrderStatus[] = ['PAID', 'PARTIALLY_REFUNDED'];
const PROVIDER: Record<string, string> = { RAZORPAY: 'Razorpay', STRIPE: 'Stripe', MOCK: 'Test', NONE: 'Free' };

/** Support view over order-service: find an order by buyer, refund all or part of it. */
export function OrdersPanel() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await adminOrdersApi.list({ status: status || undefined, email: query || undefined, page, size: PAGE_SIZE });
      setOrders(result.orders);
      setTotal(result.total);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load orders.'));
      setOrders([]);
    }
  }, [status, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  // search as the admin types, without a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setQuery(email.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [email]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Order id copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Search by buyer email"
            aria-label="Search orders by buyer email"
            className="h-10 w-full rounded-xl border border-border bg-foreground/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </label>
        <select
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value as OrderStatus | '');
          }}
          aria-label="Filter by status"
          className="h-10 rounded-xl border border-border bg-foreground/[0.03] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        >
          {FILTERS.map((f) => (
            <option key={f.value || 'all'} value={f.value} className="bg-background">
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {orders === null ? (
        <Skeleton className="h-64 w-full rounded-[14px]" />
      ) : error ? (
        <EmptyState icon={<Receipt />} title="Orders are unavailable" description={error} action={<Button variant="outline" onClick={load}>Try again</Button>} />
      ) : orders.length === 0 ? (
        <EmptyState icon={<Receipt />} title={query || status ? 'No orders match' : 'No orders yet'} description={query ? `Nothing for “${query}”.` : undefined} />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.03] text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Buyer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((o) => (
                <tr key={o.orderId} className="transition-colors hover:bg-foreground/[0.02]">
                  <td className="max-w-[240px] px-4 py-3">
                    <Link href={`/courses/${o.courseId}`} className="block truncate font-medium hover:underline">
                      {o.courseTitle}
                    </Link>
                    <button
                      type="button"
                      onClick={() => copy(o.orderId)}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Copy order id"
                    >
                      <span className="font-mono">#{o.orderId.slice(0, 8)}</span> · {relativeTime(o.createdAt)} <Copy className="h-3 w-3" />
                    </button>
                  </td>
                  <td className="hidden max-w-[220px] truncate px-4 py-3 text-muted-foreground md:table-cell">{o.userEmail ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-medium tabular-nums">{o.amountMinor === 0 ? 'Free' : formatMinor(o.amountMinor, o.currency)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {PROVIDER[o.provider] ?? o.provider}
                      {o.refundedMinor ? ` · −${formatMinor(o.refundedMinor, o.currency)}` : ''}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <OrderStatusBadge status={o.status} amountMinor={o.amountMinor} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {REFUNDABLE.includes(o.status) && o.amountMinor > 0 ? (
                      <Button size="sm" variant="outline" onClick={() => setRefunding(o)}>
                        Refund
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      <RefundDialog order={refunding} onClose={() => setRefunding(null)} onRefunded={load} />
    </section>
  );
}
