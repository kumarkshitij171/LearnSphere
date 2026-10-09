'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/money';

export interface PriceValue {
  free: boolean;
  /** exactly what was typed, so the field can be cleared and retyped */
  amount: string;
}

export const MAX_PRICE = 500000;

/** The backend's rule, mirrored so the message shows while typing (utils/validation.ts). */
export function priceProblem(value: PriceValue): string | null {
  if (value.free) return null;
  if (!value.amount.trim()) return 'Enter a price, or make the course free.';
  const n = Number(value.amount);
  if (!Number.isFinite(n)) return 'Enter a number.';
  if (n < 1) return 'A paid course must cost at least ₹1.';
  if (n > MAX_PRICE) return 'The maximum price is ₹5,00,000.';
  return null;
}

export function priceToNumber(value: PriceValue): number {
  return value.free ? 0 : Number(value.amount) || 0;
}

export function priceFromNumber(price: number): PriceValue {
  return price > 0 ? { free: false, amount: String(price) } : { free: true, amount: '' };
}

export function PriceField({
  value,
  onChange,
  currency = 'INR',
  disabled,
}: {
  value: PriceValue;
  onChange: (v: PriceValue) => void;
  currency?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const problem = value.amount ? priceProblem(value) : null;
  const symbol = currency === 'INR' ? '₹' : currency;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          Price
        </label>
        <div role="radiogroup" aria-label="Pricing" className="inline-flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/10">
          {(['free', 'paid'] as const).map((kind) => {
            const active = kind === 'free' ? value.free : !value.free;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange({ ...value, free: kind === 'free' })}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                  active ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {kind === 'free' ? 'Free' : 'Paid'}
              </button>
            );
          })}
        </div>
      </div>

      {value.free ? (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-muted-foreground">
          Anyone can enrol for free.
        </p>
      ) : (
        <>
          <div
            className={cn(
              'flex h-11 items-center overflow-hidden rounded-lg border bg-white/[0.03] transition-colors focus-within:ring-2',
              problem ? 'border-red-500/50 focus-within:ring-red-500/30' : 'border-white/10 focus-within:border-primary/50 focus-within:ring-primary/30'
            )}
          >
            <span className="grid h-full place-items-center border-r border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-muted-foreground">
              {symbol}
            </span>
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="499"
              disabled={disabled}
              value={value.amount}
              onChange={(e) => /^\d*(\.\d{0,2})?$/.test(e.target.value) && onChange({ ...value, amount: e.target.value })}
              className="h-full flex-1 bg-transparent px-3 text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
              aria-invalid={Boolean(problem)}
              aria-describedby={`${id}-hint`}
            />
          </div>
          <p id={`${id}-hint`} className={cn('text-xs', problem ? 'text-red-300' : 'text-muted-foreground')}>
            {problem ?? (value.amount ? `Students pay ${formatPrice(Number(value.amount), currency)}` : 'Between ₹1 and ₹5,00,000.')}
          </p>
        </>
      )}
    </div>
  );
}
