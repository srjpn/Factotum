import { z } from 'zod';

const ConfigSchema = z.object({
  FACTO_API_URL: z.string().url(),
});

export type AgentConfig = {
  apiUrl: string;
};

// The control plane address is always configured, never assumed to be localhost,
// so the control plane can move to another machine without a code change.
export function loadConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  return { apiUrl: ConfigSchema.parse(env).FACTO_API_URL };
}
