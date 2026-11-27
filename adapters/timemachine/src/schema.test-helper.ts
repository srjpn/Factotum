import { INVENTORY_KINDS } from '@facto/contracts';
import { expect } from 'vitest';

export const BackupItemSchemaCheck = (item: unknown): void => {
  expect(INVENTORY_KINDS.backup.safeParse(item).success).toBe(true);
};
