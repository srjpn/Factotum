import { z } from 'zod';
import { parseTargets, type PrivacyPolicy } from './privacy/privacy.js';

const ConfigSchema = z.object({
  FACTO_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FACTO_DATABASE_URL: z.string().url(),
  // Interim owner credential until real login arrives in LT-6.
  FACTO_ADMIN_TOKEN: z.string().min(24, 'must be at least 24 characters'),
  // A node with no heartbeat for this long is offline. Agents beat every 30 s, so 90 s tolerates two misses
  // and stays inside the 2 minute rule.
  FACTO_OFFLINE_AFTER_SECONDS: z.coerce.number().int().min(10).max(110).default(90),
  // How often the monitor checks for status changes. 0 turns it off (used in tests).
  FACTO_STATUS_CHECK_SECONDS: z.coerce.number().int().min(0).default(15),
  // Optional ntfy notifications (LT-16). Both URL and topic are needed to turn them on. No default server.
  FACTO_NTFY_URL: z.string().url().optional(),
  FACTO_NTFY_TOPIC: z.string().min(1).optional(),
  FACTO_NTFY_TOKEN: z.string().min(1).optional(),
  // Privacy policy (LT-12): comma-separated targets where work of each class may run. `*` = any.
  // client-data has no default, so nothing is allowed until the owner lists targets (fail closed).
  FACTO_PRIVACY_CLIENT_DATA_TARGETS: z.string().optional(),
  FACTO_PRIVACY_PERSONAL_TARGETS: z.string().optional(),
});

export type Config = {
  port: number;
  databaseUrl: string;
  adminToken: string;
  offlineAfterSeconds: number;
  statusCheckSeconds: number;
  privacy: PrivacyPolicy;
  ntfy?: { url: string; topic: string; token?: string };
};

// Every setting comes from the environment so the same image runs on any machine.
// There is deliberately no default for the database URL or the admin token.
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat empty strings (an unset Compose variable) as unset.
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = ConfigSchema.parse(clean);
  const ntfy =
    parsed.FACTO_NTFY_URL && parsed.FACTO_NTFY_TOPIC
      ? {
          url: parsed.FACTO_NTFY_URL,
          topic: parsed.FACTO_NTFY_TOPIC,
          ...(parsed.FACTO_NTFY_TOKEN ? { token: parsed.FACTO_NTFY_TOKEN } : {}),
        }
      : undefined;
  return {
    port: parsed.FACTO_PORT,
    databaseUrl: parsed.FACTO_DATABASE_URL,
    adminToken: parsed.FACTO_ADMIN_TOKEN,
    offlineAfterSeconds: parsed.FACTO_OFFLINE_AFTER_SECONDS,
    statusCheckSeconds: parsed.FACTO_STATUS_CHECK_SECONDS,
    privacy: {
      'client-data': parseTargets(parsed.FACTO_PRIVACY_CLIENT_DATA_TARGETS, []),
      personal: parseTargets(parsed.FACTO_PRIVACY_PERSONAL_TARGETS, '*'),
    },
    ...(ntfy ? { ntfy } : {}),
  };
}
