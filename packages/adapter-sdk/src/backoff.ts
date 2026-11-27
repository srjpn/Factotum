export interface BackoffOptions {
  baseMs: number;
  capMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1000, capMs: 60_000 };

/** Exponential backoff with full jitter: a random delay between 0 and min(cap, base * 2^attempt). */
export function backoffDelay(attempt: number, opts: BackoffOptions = DEFAULT_BACKOFF, random = Math.random): number {
  const ceiling = Math.min(opts.capMs, opts.baseMs * 2 ** Math.min(attempt, 30));
  return Math.floor(random() * ceiling);
}
