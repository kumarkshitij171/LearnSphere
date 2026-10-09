import { toMinorUnits } from '../../utils/money';

describe('toMinorUnits', () => {
  it('converts a whole-rupee price', () => {
    expect(toMinorUnits(499)).toBe(49900);
  });

  it('converts a fractional price without float drift', () => {
    expect(toMinorUnits(499.99)).toBe(49999);
    expect(toMinorUnits(0.29)).toBe(29);
    expect(toMinorUnits(1.005)).toBe(101);
  });

  it('treats a free course as zero', () => {
    expect(toMinorUnits(0)).toBe(0);
  });

  it('honours a non-2 exponent', () => {
    expect(toMinorUnits(1.5, 3)).toBe(1500);
  });

  it('rejects values that cannot be money', () => {
    expect(() => toMinorUnits(-1)).toThrow();
    expect(() => toMinorUnits(NaN)).toThrow();
    expect(() => toMinorUnits(Infinity)).toThrow();
  });
});
