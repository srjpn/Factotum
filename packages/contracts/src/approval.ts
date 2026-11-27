import { z } from 'zod';
import { RiskLevelSchema } from './risk.js';

// LT-11: policy tiers and owner approval.
export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** A caller asks the core for permission to run an action. Dotted lowercase name, e.g. `docker.container.restart`. */
export const ActionRequestSchema = z.object({
  action: z.string().regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)*$/).max(100),
  risk: RiskLevelSchema,
  targetType: z.string().max(100).optional(),
  targetId: z.string().max(200).optional(),
  /** One line shown to the owner. */
  summary: z.string().max(500).optional(),
  /** Parameters for the action. Stored and shown to the owner; never put secrets here. */
  params: z.record(z.string(), z.unknown()).optional(),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  action: z.string(),
  risk: RiskLevelSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  summary: z.string().nullable(),
  params: z.record(z.string(), z.unknown()),
  requesterType: z.enum(['owner', 'adapter']),
  requesterId: z.string(),
  status: ApprovalStatusSchema,
  requestedAt: z.string(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  decidedBy: z.string().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

/** `allowed`: run it now (read, reversible). `pending`: wait for the owner; poll `GET /approvals/:id`. */
export const ActionDecisionSchema = z.object({
  decision: z.enum(['allowed', 'pending']),
  approval: ApprovalSchema.nullable(),
});
export type ActionDecision = z.infer<typeof ActionDecisionSchema>;
