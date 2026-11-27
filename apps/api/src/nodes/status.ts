import type { NodeStatus } from '@facto/contracts';

export function computeStatus(
  node: { revokedAt: Date | null; lastHeartbeatAt: Date | null },
  now: Date,
  offlineAfterSeconds: number,
): NodeStatus {
  if (node.revokedAt) return 'revoked';
  if (!node.lastHeartbeatAt) return 'pending';
  const silentMs = now.getTime() - node.lastHeartbeatAt.getTime();
  return silentMs > offlineAfterSeconds * 1000 ? 'offline' : 'online';
}
