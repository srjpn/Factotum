import { z } from 'zod';

/** macOS helpers and container runtimes that listen on ports but are not developer servers. Case-insensitive, exact match. */
export const DEFAULT_IGNORED_PROCESSES = [
  'rapportd', 'controlcenter', 'sharingd', 'remoted', 'identityservicesd', 'airplayxpchelper', 'mdnsresponder',
  'com.docker.backend', 'vpnkit', 'limactl', 'tailscaled', 'tailscale', 'ssh',
];

const list = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  DEVSERVERS_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  DEVSERVERS_IGNORE_PORTS: z.string().optional(), // comma separated, e.g. "3000,5432"
  DEVSERVERS_IGNORE_PROCESSES: z.string().optional(), // comma separated, added to the defaults
  DEVSERVERS_MIN_PORT: z.coerce.number().int().min(1).max(65535).default(1024),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./devservers-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface DevServersConfig {
  apiUrl: string;
  syncIntervalMs: number;
  ignorePorts: Set<number>;
  ignoreProcesses: Set<string>;
  minPort: number;
  stateFile: string;
  adminToken?: string;
}

/** Reads settings from the environment only. */
export function loadConfig(env: Record<string, string | undefined> = process.env): DevServersConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const e = parsed.data;
  const ports = list(e.DEVSERVERS_IGNORE_PORTS).map(Number);
  if (ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) {
    throw new Error('invalid configuration: DEVSERVERS_IGNORE_PORTS must be comma separated port numbers');
  }
  return {
    apiUrl: e.FACTO_API_URL,
    syncIntervalMs: e.DEVSERVERS_SYNC_INTERVAL_SECONDS * 1000,
    ignorePorts: new Set(ports),
    ignoreProcesses: new Set([...DEFAULT_IGNORED_PROCESSES, ...list(e.DEVSERVERS_IGNORE_PROCESSES)].map((s) => s.toLowerCase())),
    minPort: e.DEVSERVERS_MIN_PORT,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
