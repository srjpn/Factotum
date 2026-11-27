import { z } from 'zod';

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

const EnvSchema = z.object({
  FACTO_API_URL: z.string().url(),
  JIRA_BASE_URL: z.string().url(),
  JIRA_EMAIL: z.string().min(3),
  JIRA_API_TOKEN: z.string().min(1),
  JIRA_PROJECT_KEYS: z
    .string()
    .transform((s) => s.split(',').map((k) => k.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(KEY, 'project keys may only contain letters, digits and underscores')).min(1, 'at least one project key is required')),
  JIRA_JQL_EXTRA: z.string().optional(),
  JIRA_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
  FACTO_ADAPTER_STATE_FILE: z.string().min(1).default('./jira-adapter.state.json'),
  FACTO_ADMIN_TOKEN: z.string().optional(),
});

export interface JiraConfig {
  apiUrl: string;
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys: string[];
  jqlExtra?: string;
  syncIntervalMs: number;
  stateFile: string;
  adminToken?: string;
}

/** Reads settings from the environment only. Error messages name the setting, never its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): JiraConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  const e = parsed.data;
  return {
    apiUrl: e.FACTO_API_URL,
    baseUrl: e.JIRA_BASE_URL.replace(/\/+$/, ''),
    email: e.JIRA_EMAIL,
    apiToken: e.JIRA_API_TOKEN,
    projectKeys: e.JIRA_PROJECT_KEYS,
    ...(e.JIRA_JQL_EXTRA?.trim() ? { jqlExtra: e.JIRA_JQL_EXTRA.trim() } : {}),
    syncIntervalMs: e.JIRA_SYNC_INTERVAL_SECONDS * 1000,
    stateFile: e.FACTO_ADAPTER_STATE_FILE,
    adminToken: e.FACTO_ADMIN_TOKEN,
  };
}
