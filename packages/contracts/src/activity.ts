import { z } from 'zod';
import { RiskLevelSchema } from './risk.js';

export const ActorTypeSchema = z.enum(['owner', 'node', 'adapter', 'system']);
export const OutcomeSchema = z.enum(['success', 'denied', 'failure']);

export const ActivityEntrySchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  actorType: ActorTypeSchema,
  actorId: z.string(),
  action: z.string(),
  risk: RiskLevelSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  outcome: OutcomeSchema,
  details: z.record(z.string(), z.unknown()),
});

export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
export type ActorType = z.infer<typeof ActorTypeSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
