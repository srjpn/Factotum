import { describe, expect, it } from 'vitest';
import { ContainerItemSchema } from '@facto/contracts';
import { formatPorts, healthFromStatus, mapStatus, toContainerItem } from './convert.js';

describe('state and health mapping', () => {
  it('maps Docker states', () => {
    expect(mapStatus('running', 'none')).toBe('running');
    expect(mapStatus('running', 'healthy')).toBe('running');
    expect(mapStatus('running', 'unhealthy')).toBe('unhealthy');
    expect(mapStatus('restarting', 'none')).toBe('restarting');
    for (const s of ['exited', 'created', 'dead']) expect(mapStatus(s, 'none')).toBe('stopped');
    for (const s of ['paused', 'removing', 'mystery']) expect(mapStatus(s, 'none')).toBe('other');
  });
  it('reads health from the status text', () => {
    expect(healthFromStatus('Up 2 hours (healthy)')).toBe('healthy');
    expect(healthFromStatus('Up 2 hours (unhealthy)')).toBe('unhealthy');
    expect(healthFromStatus('Up 3 seconds (health: starting)')).toBe('starting');
    expect(healthFromStatus('Up 2 hours')).toBe('none');
    expect(healthFromStatus('Exited (0) 5 minutes ago')).toBe('none');
  });
});

describe('port formatting', () => {
  it('keeps published ports only, deduplicated and sorted', () => {
    expect(
      formatPorts([
        { IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
        { IP: '::1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
        { IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
        { PrivatePort: 5432, Type: 'tcp' }, // exposed, not published
        { PrivatePort: 53, PublicPort: 5353, Type: 'udp' },
      ]),
    ).toEqual(['127.0.0.1:3000->3000/tcp', '5353->53/udp', '::1:3000->3000/tcp']);
    expect(formatPorts(undefined)).toEqual([]);
  });
});

describe('toContainerItem', () => {
  const raw = {
    Id: 'abcdef0123456789abcdef',
    Names: ['/facto-api-1'],
    Image: 'facto-api:latest',
    State: 'running',
    Status: 'Up 1 hour (healthy)',
    Ports: [{ IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
    Labels: { 'com.docker.compose.project': 'facto', 'secret.label': 'hunter2' },
    Env: ['DB_PASSWORD=hunter2'],
    Mounts: [{ Source: '/home/me/.ssh' }],
    Command: 'run --token hunter2',
  };

  it('produces a valid item with the compose project and short id', () => {
    const item = toContainerItem(raw)!;
    expect(ContainerItemSchema.safeParse(item).success).toBe(true);
    expect(item).toEqual({
      externalId: 'abcdef012345',
      name: 'facto-api-1',
      image: 'facto-api:latest',
      status: 'running',
      statusLabel: 'running',
      health: 'healthy',
      composeProject: 'facto',
      source: 'docker',
      ports: ['127.0.0.1:3000->3000/tcp'],
    });
  });

  it('never leaks env, other labels, mounts or the command', () => {
    const json = JSON.stringify(toContainerItem(raw));
    for (const s of ['hunter2', 'DB_PASSWORD', 'secret.label', '.ssh', 'Command', '--token']) expect(json).not.toContain(s);
  });

  it('falls back to the id when unnamed, and skips entries without an id', () => {
    expect(toContainerItem({ ...raw, Names: [] })!.name).toBe('abcdef012345');
    expect(toContainerItem({ State: 'running' })).toBeNull();
  });
});
