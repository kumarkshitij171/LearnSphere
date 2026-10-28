export interface PollOptions {
  intervalMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Resolves with the first value matching `done`, or null when the time budget runs out. */
export async function pollUntil<T>(
  fetch: () => Promise<T>,
  done: (value: T) => boolean,
  { intervalMs, timeoutMs, signal }: PollOptions
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (!signal?.aborted) {
    try {
      const value = await fetch();
      if (done(value)) return value;
    } catch {
      // a transient failure is just another tick; the deadline still bounds the wait
    }
    if (Date.now() + intervalMs > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
