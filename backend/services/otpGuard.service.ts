import { createHash } from 'crypto';
import { getRedis } from '../utils/redis';

/** Wrong guesses allowed per activation code before it is dead and a new one is needed. */
export const MAX_OTP_ATTEMPTS = 5;
/** Activation emails one address can trigger per window — stops inbox flooding. */
export const MAX_RESENDS = 3;
const WINDOW_SECONDS = 15 * 60;

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);

async function bump(key: string): Promise<number | null> {
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    return count;
  } catch (error) {
    // the per-IP limiter still bounds abuse while Redis is down; refusing every sign-up would be worse
    console.error('[otp-guard] Redis unavailable, attempt not counted:', (error as Error).message);
    return null;
  }
}

/** Counts a verification attempt against this code; false once it has used up its tries. */
export async function allowOtpAttempt(token: string): Promise<boolean> {
  const count = await bump(`otp:attempts:${digest(token)}`);
  return count === null || count <= MAX_OTP_ATTEMPTS;
}

/** Counts an activation email for this address; false once it has had its share for the window. */
export async function allowResend(email: string): Promise<boolean> {
  const count = await bump(`otp:resend:${digest(email.toLowerCase())}`);
  return count === null || count <= MAX_RESENDS;
}
