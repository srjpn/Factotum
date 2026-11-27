import { describe, expect, it } from 'vitest';
import { ContainerItemSchema, INVENTORY_KINDS, isInventoryKind } from './inventory.js';

const ok = { externalId: 'abc123', name: 'web', image: 'nginx:1', status: 'running', statusLabel: 'running', source: 'docker' };

describe('container inventory kind', () => {
  it('is a known kind', () => {
    expect(isInventoryKind('container')).toBe(true);
    expect(INVENTORY_KINDS.container).toBe(ContainerItemSchema);
  });
  it('accepts a minimal and a full item, rejects a bad status, strips unknown fields', () => {
    expect(ContainerItemSchema.safeParse(ok).success).toBe(true);
    const full = { ...ok, health: 'healthy', composeProject: 'facto', startedAt: '2026-11-27T10:00:00Z', ports: ['127.0.0.1:3000->3000/tcp'] };
    expect(ContainerItemSchema.safeParse(full).success).toBe(true);
    expect(ContainerItemSchema.safeParse({ ...ok, status: 'paused' }).success).toBe(false);
    expect(ContainerItemSchema.parse({ ...ok, env: ['A=1'] })).not.toHaveProperty('env');
  });
});
