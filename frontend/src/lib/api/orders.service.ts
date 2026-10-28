import { orderClient } from './client';
import { endpoints } from './endpoints';

export type OrderStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type PaymentProvider = 'MOCK' | 'RAZORPAY' | 'STRIPE' | 'NONE';

/** Provider-specific bag for the browser SDK; switch on `provider` to read `params`. */
export interface OrderCheckout {
  providerOrderId: string;
  publicKey?: string | null;
  params: Record<string, unknown>;
}

export interface Order {
  orderId: string;
  status: OrderStatus;
  courseId: string;
  courseTitle: string;
  amountMinor: number;
  currency: string;
  provider: PaymentProvider;
  expiresAt: string;
  paidAt?: string | null;
  createdAt: string;
  /** Present only while PENDING, so an abandoned checkout can be resumed. */
  checkout?: OrderCheckout | null;
  refundedMinor?: number;
  /** the buyer — shown to admins for support */
  userId?: string;
  userEmail?: string;
}

export interface OrderPage {
  orders: Order[];
  page: number;
  size: number;
  total: number;
}

export interface CreateOrderPayload {
  courseId: string;
  provider: PaymentProvider;
  /** Stable across retries of one purchase intent; makes the POST idempotent. */
  idempotencyKey: string;
}

export interface RefundPayload {
  /** Omit for a full refund of whatever remains. */
  amountMinor?: number;
  reason: string;
}

export const TERMINAL_STATUSES: OrderStatus[] = ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'];

export const ordersApi = {
  async create(payload: CreateOrderPayload): Promise<Order> {
    const { data } = await orderClient.post(endpoints.orders.create, payload);
    return data;
  },
  async get(orderId: string): Promise<Order> {
    const { data } = await orderClient.get(endpoints.orders.byId(orderId));
    return data;
  },
  async list(page = 0, size = 20): Promise<OrderPage> {
    const { data } = await orderClient.get(endpoints.orders.list, { params: { page, size } });
    return data;
  },
  async providers(): Promise<PaymentProvider[]> {
    const { data } = await orderClient.get(endpoints.orders.providers);
    return data?.providers ?? [];
  },
  async cancel(orderId: string): Promise<Order> {
    const { data } = await orderClient.post(endpoints.orders.cancel(orderId));
    return data;
  },
  async retry(orderId: string): Promise<Order> {
    const { data } = await orderClient.post(endpoints.orders.retry(orderId));
    return data;
  },
  /** Dev only: completes a MOCK checkout the way a gateway webhook would. */
  mockGateway(providerOrderId: string, outcome: 'capture' | 'fail') {
    return orderClient.post(endpoints.orders.mockGateway(providerOrderId, outcome));
  },
};

export const adminOrdersApi = {
  async list(
    params: { status?: OrderStatus; userId?: string; email?: string; page?: number; size?: number } = {}
  ): Promise<OrderPage> {
    const { data } = await orderClient.get(endpoints.adminOrders.list, { params });
    return data;
  },
  async refund(orderId: string, payload: RefundPayload): Promise<Order> {
    const { data } = await orderClient.post(endpoints.adminOrders.refund(orderId), payload);
    return data;
  },
};
