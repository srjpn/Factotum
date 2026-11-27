import { z } from 'zod';

const ConfigSchema = z.object({
  FACTO_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FACTO_DATABASE_URL: z.string().url(),
  // Interim owner credential until real login arrives in LT-6.
  FACTO_ADMIN_TOKEN: z.string().min(24, 'must be at least 24 characters'),
});

export type Config = {
  port: number;
  databaseUrl: string;
  adminToken: string;
};

// Every setting comes from the environment so the same image runs on any machine.
// There is deliberately no default for the database URL or the admin token.
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse(env);
  return {
    port: parsed.FACTO_PORT,
    databaseUrl: parsed.FACTO_DATABASE_URL,
    adminToken: parsed.FACTO_ADMIN_TOKEN,
  };
}
