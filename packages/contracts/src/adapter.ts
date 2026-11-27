import { createRequire } from 'node:module';
import { z } from 'zod';
import * as AjvModule from 'ajv/dist/2020.js';
import { type RiskLevel } from './risk.js';
import manifestSchema from './adapter-manifest.schema.json' with { type: 'json' };


export interface AdapterAction {
  name: string;
  description?: string;
  permission: string;
  risk: RiskLevel;
  input_schema?: string;
}

/** Shape of schemas/adapter-manifest.schema.json. The JSON schema is the authority. */
export interface AdapterManifest {
  name: string;
  version: string;
  contract?: string;
  domain: string;
  tier: 'link' | 'observe' | 'control';
  reports?: string[];
  actions?: AdapterAction[];
  events?: { publishes?: string[]; consumes?: string[] };
  secrets?: string[];
  health: string;
  config_schema?: string;
  ui?: { tile?: { title: string; link: string }; widgets?: string[] };
}

// ajv ships CommonJS; resolve the constructor whichever way the loader exposes it.
type AjvCtor = new (opts: { allErrors: boolean; strict: boolean }) => {
  compile(schema: object): {
    (data: unknown): boolean;
    errors?: { instancePath: string; message?: string }[] | null;
  };
};
const mod = AjvModule as unknown as { default?: AjvCtor | { default?: AjvCtor } };
const Ajv2020: AjvCtor = ((typeof mod.default === 'function' ? mod.default : mod.default?.default) ??
  (createRequire(import.meta.url)('ajv/dist/2020.js') as AjvCtor)) as AjvCtor;

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(manifestSchema);

export type ManifestValidation =
  | { ok: true; manifest: AdapterManifest }
  | { ok: false; errors: string[] };

/** Validates an unknown value against the adapter manifest JSON schema. */
export function validateManifest(input: unknown): ManifestValidation {
  if (validate(input)) return { ok: true, manifest: input as AdapterManifest };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
  return { ok: false, errors };
}

/** Scopes a service token carries: one per declared permission, plus reporting health. */
export const HEALTH_REPORT_SCOPE = 'adapter.health.report';
export function scopesForManifest(manifest: AdapterManifest): string[] {
  const perms = (manifest.actions ?? []).map((a) => a.permission);
  return [...new Set([HEALTH_REPORT_SCOPE, ...perms])].sort();
}

export const ADAPTER_HEALTH_STATUSES = ['up', 'degraded', 'down'] as const;

export const AdapterHealthReportSchema = z.object({
  status: z.enum(ADAPTER_HEALTH_STATUSES),
  detail: z.string().max(500).optional(),
});
export type AdapterHealthReport = z.infer<typeof AdapterHealthReportSchema>;

/** Public view of a registered adapter. Never carries the token or its hash. */
export const AdapterSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  domain: z.string(),
  tier: z.enum(['link', 'observe', 'control']),
  scopes: z.array(z.string()),
  status: z.enum(['unknown', ...ADAPTER_HEALTH_STATUSES]),
  statusDetail: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  registeredAt: z.string(),
});
export type AdapterSummary = z.infer<typeof AdapterSummarySchema>;

/** Response to registration. `token` is shown exactly once. */
export const AdapterRegistrationSchema = AdapterSummarySchema.extend({ token: z.string() });
export type AdapterRegistration = z.infer<typeof AdapterRegistrationSchema>;
