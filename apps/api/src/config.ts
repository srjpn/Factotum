import { z } from 'zod';

const ConfigSchema = z.object({
  FACTO_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FACTO_DATABASE_URL: z.string().url(),
});

export type Config = {
  port: number;
  databaseUrl: string;
};

// Every setting comes from the environment so the same image runs on any machine.
// There is deliberately no default for the database URL.
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse(env);
  return { port: parsed.FACTO_PORT, databaseUrl: parsed.FACTO_DATABASE_URL };
}
