import { z } from 'zod';

const byteUsage = z.object({
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().positive(),
});

export const HeartbeatSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memory: byteUsage,
  disk: byteUsage,
  battery: z.object({ percent: z.number().min(0).max(100), charging: z.boolean() }).optional(),
});
export type Heartbeat = z.infer<typeof HeartbeatSchema>;

export const NodeNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'lowercase letters, digits and dashes');

export const CreateEnrolmentTokenRequestSchema = z.object({
  nodeName: NodeNameSchema,
  ttlMinutes: z.number().int().min(1).max(1440).default(60),
});
export type CreateEnrolmentTokenRequest = z.infer<typeof CreateEnrolmentTokenRequestSchema>;

export const EnrolmentTokenResponseSchema = z.object({
  token: z.string(),
  nodeName: z.string(),
  expiresAt: z.string(),
});
export type EnrolmentTokenResponse = z.infer<typeof EnrolmentTokenResponseSchema>;

export const EnrolRequestSchema = z.object({ token: z.string().min(1) });
export type EnrolRequest = z.infer<typeof EnrolRequestSchema>;

export const EnrolResponseSchema = z.object({
  nodeId: z.string().uuid(),
  nodeName: z.string(),
  credential: z.string(),
});
export type EnrolResponse = z.infer<typeof EnrolResponseSchema>;

// pending: enrolled but no heartbeat yet. offline: no heartbeat within the configured window.
export const NodeStatusSchema = z.enum(['pending', 'online', 'offline', 'revoked']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const NodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: NodeStatusSchema,
  createdAt: z.string(),
  lastHeartbeatAt: z.string().nullable(),
  lastMetrics: HeartbeatSchema.nullable(),
  revokedAt: z.string().nullable(),
});
export type Node = z.infer<typeof NodeSchema>;
