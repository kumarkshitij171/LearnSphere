import crypto from 'crypto';

// Key order must not change the checksum, or an unchanged document would look like a new version.
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const checksumOf = (value: unknown): string =>
  crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
