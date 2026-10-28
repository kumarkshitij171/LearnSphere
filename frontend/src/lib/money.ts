// Display only. Amounts from order-service are integer minor units; course prices are still
// a decimal number from the catalogue (backend Course.price), shown but never charged from.

const localeFor = (currency: string) => (currency === 'INR' ? 'en-IN' : 'en-US');

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMinor(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency }).format(
    amountMinor / 10 ** digits
  );
}

export function formatPrice(price: number, currency = 'INR'): string {
  if (!price) return 'Free';
  return new Intl.NumberFormat(localeFor(currency), { style: 'currency', currency }).format(price);
}

/** Admin input only (a refund amount typed in major units); rounds to the currency's exponent. */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * 10 ** fractionDigits(currency));
}
