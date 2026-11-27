import { z } from 'zod';
import { RiskLevelSchema } from './risk.js';

// LT-13: write actions. The owner asks the core to run a declared adapter action; the core applies policy and
// queues it; the adapter polls, executes against its own tool and reports the outcome. See
// docs/architecture/adapter-contract.md ("Running actions").
export const ActionRunStatusSchema = z.enum([
  'awaiting_approval', // destructive or privileged: waiting for the owner
  'queued', // allowed (or approved): waiting for the adapter to claim it
  'running', // claimed by the adapter
  'succeeded',
  'failed',
  'cancelled', // approval denied or expired
]);
export type ActionRunStatus = z.infer<typeof ActionRunStatusSchema>;

/** Owner request to run `action` (a name from the adapter's manifest) on `adapter`. The risk comes from the manifest, never from the caller. */
export const ActionRunRequestSchema = z.object({
  adapter: z.string().regex(/^[a-z][a-z0-9-]*$/).max(100),
  action: z.string().regex(/^[a-z][a-z0-9-]*$/).max(100),
  params: z.record(z.string(), z.unknown()).default({}),
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(200).optional(),
  summary: z.string().max(500).optional(),
});
export type ActionRunRequest = z.input<typeof ActionRunRequestSchema>;

export const ActionRunSchema = z.object({
  id: z.string(),
  adapter: z.string(),
  action: z.string(),
  risk: RiskLevelSchema,
  params: z.record(z.string(), z.unknown()),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  summary: z.string().nullable(),
  status: ActionRunStatusSchema,
  approvalId: z.string().nullable(),
  requestedBy: z.string(),
  requestedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** Short outcome text from the adapter. Never carries secrets or tool payloads. */
  detail: z.string().nullable(),
});
export type ActionRun = z.infer<typeof ActionRunSchema>;

/** Response to an adapter's claim: the oldest queued run for it, or null. */
export const ActionClaimSchema = z.object({ run: ActionRunSchema.nullable() });
export type ActionClaim = z.infer<typeof ActionClaimSchema>;

export const ActionResultReportSchema = z.object({
  outcome: z.enum(['success', 'failure']),
  detail: z.string().max(500).optional(),
});
export type ActionResultReport = z.infer<typeof ActionResultReportSchema>;
