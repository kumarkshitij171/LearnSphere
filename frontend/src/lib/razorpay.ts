import type { Order } from '@/lib/api';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not load the Razorpay checkout. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}

export interface RazorpayHandlers {
  /** The browser believes it paid. Only a reason to start polling: the webhook decides. */
  onSubmitted: () => void;
  onDismissed: () => void;
  onAttemptFailed: (message: string) => void;
}

export async function openRazorpayCheckout(order: Order, handlers: RazorpayHandlers): Promise<void> {
  const checkout = order.checkout;
  if (!checkout?.publicKey) throw new Error('This order has no Razorpay checkout to open.');
  await loadScript();
  if (!window.Razorpay) throw new Error('Razorpay checkout is unavailable.');

  const params = checkout.params ?? {};
  const instance = new window.Razorpay({
    key: checkout.publicKey,
    order_id: checkout.providerOrderId,
    amount: order.amountMinor,
    currency: order.currency,
    name: params.name ?? 'LearnSphere',
    description: params.description ?? order.courseTitle,
    prefill: params.prefill ?? {},
    theme: { color: '#a3e635' },
    handler: () => handlers.onSubmitted(),
    modal: { ondismiss: () => handlers.onDismissed() },
  });
  // fires per attempt; the modal stays open so the buyer can try another method
  instance.on('payment.failed', (response) =>
    handlers.onAttemptFailed(response.error?.description || 'The payment was declined.')
  );
  instance.open();
}
