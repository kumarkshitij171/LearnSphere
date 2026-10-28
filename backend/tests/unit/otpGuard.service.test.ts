const store = new Map<string, number>();
const redis = {
  incr: jest.fn(async (k: string) => {
    store.set(k, (store.get(k) ?? 0) + 1);
    return store.get(k)!;
  }),
  expire: jest.fn(async () => 1),
};
let redisDown = false;
jest.mock('../../utils/redis', () => ({
  getRedis: () => {
    if (redisDown) throw new Error('connection refused');
    return redis;
  },
}));

import { MAX_OTP_ATTEMPTS, MAX_RESENDS, allowOtpAttempt, allowResend } from '../../services/otpGuard.service';

beforeEach(() => {
  store.clear();
  redisDown = false;
  redis.expire.mockClear();
});

describe('otp guard', () => {
  it(`allows ${MAX_OTP_ATTEMPTS} attempts per code, then refuses`, async () => {
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) expect(await allowOtpAttempt('token-a')).toBe(true);
    expect(await allowOtpAttempt('token-a')).toBe(false);
    // another code is unaffected
    expect(await allowOtpAttempt('token-b')).toBe(true);
  });

  it('starts the window on the first attempt only', async () => {
    await allowOtpAttempt('token-a');
    await allowOtpAttempt('token-a');
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it(`allows ${MAX_RESENDS} activation emails per address, case-insensitively`, async () => {
    for (let i = 0; i < MAX_RESENDS; i++) expect(await allowResend(i % 2 ? 'Jane@Example.com' : 'jane@example.com')).toBe(true);
    expect(await allowResend('JANE@example.com')).toBe(false);
  });

  it('never stores the raw token or email as a key', async () => {
    await allowOtpAttempt('secret-token-value');
    await allowResend('jane@example.com');
    for (const key of store.keys()) {
      expect(key).not.toContain('secret-token-value');
      expect(key).not.toContain('jane@');
    }
  });

  it('fails open when Redis is down — the per-IP limiter still applies', async () => {
    redisDown = true;
    expect(await allowOtpAttempt('token-a')).toBe(true);
    expect(await allowResend('jane@example.com')).toBe(true);
  });
});
