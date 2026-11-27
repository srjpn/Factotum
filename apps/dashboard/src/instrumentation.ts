// Fail fast at server start when configuration is missing or invalid.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./lib/env');
    getEnv();
  }
}
