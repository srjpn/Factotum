/** The core rejected our credential (HTTP 401). Retrying will not help. */
export class AuthError extends Error {
  constructor(message = 'the core rejected the adapter service token (401); re-register the adapter') {
    super(message);
    this.name = 'AuthError';
  }
}

/** A non-retryable response from the core (4xx other than 401/429). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
