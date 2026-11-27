export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 60_000;

// Exponential backoff with full jitter. attempt starts at 1. random() is injectable for tests.
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  // Keep at least half the ceiling so retries never spin.
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
