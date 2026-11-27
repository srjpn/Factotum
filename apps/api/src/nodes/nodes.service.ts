import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type pg from 'pg';
import type {
  CreateEnrolmentTokenRequest,
  EnrolmentTokenResponse,
  EnrolResponse,
  Heartbeat,
  Node,
} from '@facto/contracts';
import { ActivityService } from '../activity/activity.service.js';
import { POOL } from '../db/db.js';
import { generateSecret, hashSecret } from '../secrets.js';

type NodeRow = {
  id: string;
  name: string;
  created_at: Date;
  last_heartbeat_at: Date | null;
  last_metrics: Heartbeat | null;
  revoked_at: Date | null;
};

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class NodesService {
  constructor(
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  async createEnrolmentToken(req: CreateEnrolmentTokenRequest): Promise<EnrolmentTokenResponse> {
    const token = generateSecret('facto_enrol');
    const { rows } = await this.pool.query<{ expires_at: Date }>(
      `INSERT INTO enrolment_tokens (token_hash, node_name, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING expires_at`,
      [hashSecret(token), req.nodeName, req.ttlMinutes],
    );
    await this.activity.record({
      actorType: 'owner',
      actorId: 'owner',
      action: 'node.enrolment-token.create',
      risk: 'privileged',
      targetType: 'node',
      targetId: req.nodeName,
      outcome: 'success',
      details: { ttlMinutes: req.ttlMinutes },
    });
    return { token, nodeName: req.nodeName, expiresAt: rows[0]!.expires_at.toISOString() };
  }

  // Exchanges a one-time token for a per-node credential. The token is consumed atomically.
  async enrol(token: string): Promise<EnrolResponse> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const used = await client.query<{ node_name: string }>(
        `UPDATE enrolment_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING node_name`,
        [hashSecret(token)],
      );
      if (!used.rowCount) {
        await client.query('ROLLBACK');
        await this.activity.record({
          actorType: 'system',
          actorId: 'enrolment',
          action: 'node.enrol',
          risk: 'privileged',
          outcome: 'denied',
          details: { reason: 'invalid, used or expired token' },
        });
        throw new UnauthorizedException('invalid or expired enrolment token');
      }
      const nodeName = used.rows[0]!.node_name;
      const credential = generateSecret('facto_node');
      let nodeId: string;
      try {
        const inserted = await client.query<{ id: string }>(
          'INSERT INTO nodes (name, credential_hash) VALUES ($1, $2) RETURNING id',
          [nodeName, hashSecret(credential)],
        );
        nodeId = inserted.rows[0]!.id;
      } catch (err) {
        await client.query('ROLLBACK');
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new ConflictException(`a node named ${nodeName} already exists`);
        }
        throw err;
      }
      await this.activity.record(
        {
          actorType: 'node',
          actorId: nodeId,
          action: 'node.enrol',
          risk: 'privileged',
          targetType: 'node',
          targetId: nodeId,
          outcome: 'success',
          details: { nodeName },
        },
        client,
      );
      await client.query('COMMIT');
      return { nodeId, nodeName, credential };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // Heartbeats are telemetry, not actions: they update the node's snapshot and are not logged one by one.
  // State changes (online, offline) are logged where they are detected.
  async authenticate(credential: string | null): Promise<string> {
    if (!credential) throw new UnauthorizedException('node credential required');
    const { rows } = await this.pool.query<{ id: string }>(
      'SELECT id FROM nodes WHERE credential_hash = $1 AND revoked_at IS NULL',
      [hashSecret(credential)],
    );
    if (!rows[0]) throw new UnauthorizedException('unknown or revoked node credential');
    return rows[0].id;
  }

  async recordHeartbeat(nodeId: string, metrics: Heartbeat): Promise<void> {
    await this.pool.query('UPDATE nodes SET last_heartbeat_at = now(), last_metrics = $2 WHERE id = $1', [
      nodeId,
      JSON.stringify(metrics),
    ]);
  }

  async list(): Promise<Node[]> {
    const { rows } = await this.pool.query<NodeRow>('SELECT * FROM nodes ORDER BY created_at');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at.toISOString(),
      lastHeartbeatAt: r.last_heartbeat_at?.toISOString() ?? null,
      lastMetrics: r.last_metrics,
      revokedAt: r.revoked_at?.toISOString() ?? null,
    }));
  }

  async revoke(id: string): Promise<void> {
    const result = await this.pool.query('UPDATE nodes SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
    if (!result.rowCount) throw new NotFoundException('node not found or already revoked');
    await this.activity.record({
      actorType: 'owner',
      actorId: 'owner',
      action: 'node.revoke',
      risk: 'destructive',
      targetType: 'node',
      targetId: id,
      outcome: 'success',
    });
  }
}
