const SIGNING_SECRETS = ['JWT_SECRET', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'INTERNAL_API_KEY', 'TRANCODER_API_KEY'] as const;
const MIN_LENGTH = 32;

/**
 * Secrets that make tokens forgeable in production: too short, a value copied from .env.sample,
 * or one secret reused for two purposes (an access-token secret that also signs refresh tokens).
 */
export function weakSecrets(env: NodeJS.ProcessEnv, sample: Record<string, string>): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const name of SIGNING_SECRETS) {
    const value = env[name];
    if (!value) continue;
    if (value.length < MIN_LENGTH) problems.push(`${name} is shorter than ${MIN_LENGTH} characters`);
    if (sample[name] && value === sample[name]) problems.push(`${name} is the example value from .env.sample`);
    const reused = seen.get(value);
    if (reused) problems.push(`${name} reuses the value of ${reused}`);
    seen.set(value, name);
  }
  return problems;
}
