import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { OrderStatus } from '@/lib/api';

const STYLES: Record<OrderStatus, { label: string; tone: BadgeProps['tone'] }> = {
  CREATED: { label: 'Started', tone: 'neutral' },
  PENDING: { label: 'Awaiting payment', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'info' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'info' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
};

/** A free enrolment is an order too, but "Paid" would be untrue — it reads "Free". */
export function OrderStatusBadge({ status, amountMinor }: { status: OrderStatus; amountMinor?: number }) {
  const style = status === 'PAID' && amountMinor === 0 ? { label: 'Free', tone: 'success' as const } : STYLES[status];
  return (
    <Badge tone={style.tone} dot>
      {style.label}
    </Badge>
  );
}
