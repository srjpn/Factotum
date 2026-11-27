import { z } from 'zod';
import { PrivacyClassSchema } from './inventory.js';

/**
 * Privacy check (LT-12). Ask where a unit of work may run before running it. Give either the privacy class
 * directly or the inventory item id (the class is then read from the inventory; an unknown item is refused).
 * `target` is an opaque name of the place the work would run (a node name, an adapter name, a model host).
 * Never put task titles or client content in any field.
 */
export const PrivacyCheckRequestSchema = z
  .object({
    privacyClass: PrivacyClassSchema.optional(),
    itemId: z.string().uuid().optional(),
    target: z.string().min(1).max(200),
    action: z.string().min(1).max(200).optional(), // the action name, for the log
  })
  .refine((v) => (v.privacyClass === undefined) !== (v.itemId === undefined), {
    message: 'give exactly one of privacyClass or itemId',
  });
export type PrivacyCheckRequest = z.infer<typeof PrivacyCheckRequestSchema>;

export const PrivacyCheckResultSchema = z.object({
  decision: z.enum(['allow', 'deny']),
  privacyClass: PrivacyClassSchema.nullable(), // null when the item was not found
  target: z.string(),
  reason: z.string(),
});
export type PrivacyCheckResult = z.infer<typeof PrivacyCheckResultSchema>;
