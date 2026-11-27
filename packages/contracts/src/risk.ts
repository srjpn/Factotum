import { z } from 'zod';

// Every action declares one of these levels (CLAUDE.md, rule 7).
export const RiskLevelSchema = z.enum(['read', 'reversible', 'destructive', 'privileged']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
