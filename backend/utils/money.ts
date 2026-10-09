/**
 * Money leaves this service in minor units (paise/cents) so no consumer has to
 * re-derive it from `Course.price`, which is still a Float. Single conversion point.
 */
export const toMinorUnits = (amount: number, exponent = 2): number => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Cannot convert ${amount} to minor units`);
  }
  // Shift the decimal exponent instead of multiplying: `1.005 * 100` is
  // 100.49999999999999 in IEEE754 and would silently round a half-paisa down.
  const shifted = Number(`${amount}e${exponent}`);
  if (!Number.isFinite(shifted)) {
    throw new Error(`Cannot convert ${amount} to minor units`);
  }
  return Math.round(shifted);
};
