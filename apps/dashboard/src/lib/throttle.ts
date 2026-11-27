// In-memory failed-login throttle. One owner, one process: a global counter is enough.
const WINDOW_MS = 15 * 60 * 1000;
const FREE_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

export class LoginThrottle {
  private failures: number[] = [];
  private lockedUntil = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Milliseconds the caller must wait before another attempt is accepted (0 if allowed). */
  lockedForMs(): number {
    return Math.max(0, this.lockedUntil - this.now());
  }

  recordFailure(): void {
    const t = this.now();
    this.failures = this.failures.filter((f) => t - f < WINDOW_MS);
    this.failures.push(t);
    if (this.failures.length >= FREE_ATTEMPTS) this.lockedUntil = t + LOCKOUT_MS;
  }

  recordSuccess(): void {
    this.failures = [];
    this.lockedUntil = 0;
  }
}

export const loginThrottle = new LoginThrottle();
export const FAILED_LOGIN_DELAY_MS = 1000;
