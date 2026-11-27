import { z } from 'zod';

// No defaults for secrets or the API address (ADR-009: movable by configuration only).
export const EnvSchema = z.object({
  FACTO_API_URL: z.url({ protocol: /^https?$/ }),
  FACTO_ADMIN_TOKEN: z.string().min(24, 'must be at least 24 characters'),
  FACTO_DASHBOARD_PASSWORD: z.string().min(8, 'must be at least 8 characters'),
  FACTO_SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Optional override for plain-http access over a private network (for example a Tailscale IP).
  FACTO_COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
});
export type Env = z.infer<typeof EnvSchema>;

/** Parse the environment. Error messages name the variables, never their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid dashboard configuration: ${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
