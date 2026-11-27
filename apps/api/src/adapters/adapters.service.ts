import { BadRequestException, ConflictException, Inject, NotFoundException, Injectable, UnauthorizedException } from '@nestjs/common';
import type pg from 'pg';
import {
  AdapterHealthReportSchema,
  HEALTH_REPORT_SCOPE,
  scopesForManifest,
  validateManifest,
  type AdapterRegistration,
  type AdapterSummary,
} from '@facto/contracts';
import { ActivityService, type NewActivity } from '../activity/activity.service.js';
import { POOL } from '../db/db.js';
import { parseBody } from '../http.js';
import { bearerToken } from '../secrets.js';
import { ADAPTER_REPOSITORY, type AdapterRecord, type AdapterRepository } from './adapter.repository.js';
import { generateToken, hashToken } from './tokens.js';

/** The slice of a pg Pool the service needs to run registration in one transaction. */
export type TransactionSource = Pick<pg.Pool, 'connect'>;

type Recorder = Pick<ActivityService, 'record'>;

export function toSummary(r: AdapterRecord): AdapterSummary {
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    domain: r.manifest.domain,
    tier: r.manifest.tier,
    scopes: r.scopes,
    status: r.status,
    statusDetail: r.statusDetail,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    registeredAt: r.registeredAt.toISOString(),
  };
}

// Owner authorisation for register and list is the AdminGuard on the controller.
@Injectable()
export class AdaptersService {
  constructor(
    @Inject(ADAPTER_REPOSITORY) private readonly repo: AdapterRepository,
    @Inject(ActivityService) private readonly activity: Recorder,
    @Inject(POOL) private readonly pool: TransactionSource,
  ) {}

  /**
   * Registers an adapter and issues its service token. Risk: privileged.
   * The row and both activity entries commit together.
   */
  async register(body: unknown): Promise<AdapterRegistration> {
    const result = validateManifest(body);
    const rawName = (body as { name?: unknown } | null)?.name;
    const base = (outcome: NewActivity['outcome'], details: Record<string, unknown>): NewActivity => ({
      actorType: 'owner',
      actorId: 'owner',
      action: 'adapter.register',
      risk: 'privileged',
      targetType: 'adapter',
      targetId: typeof rawName === 'string' ? rawName : 'unknown',
      outcome,
      details,
    });
    if (!result.ok) {
      await this.activity.record(base('denied', { errors: result.errors }));
      throw new BadRequestException({ message: 'invalid adapter manifest', errors: result.errors });
    }
    const manifest = result.manifest;
    if (await this.repo.findByName(manifest.name)) {
      throw new ConflictException(`adapter ${manifest.name} is already registered`);
    }
    const scopes = scopesForManifest(manifest);
    const token = generateToken();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await this.repo.create({ manifest, scopes, tokenHash: hashToken(token) }, client);
      await this.activity.record(
        base('success', { version: manifest.version, actions: (manifest.actions ?? []).map((a) => `${a.name}:${a.risk}`) }),
        client,
      );
      await this.activity.record(
        { ...base('success', { scopes }), action: 'adapter.token.issue' },
        client,
      );
      await client.query('COMMIT');
      return { ...toSummary(row), token };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Authenticates an adapter by its service token. */
  async authenticate(header: string | undefined): Promise<AdapterRecord> {
    const token = bearerToken(header);
    const row = token ? await this.repo.findByTokenHash(hashToken(token)) : undefined;
    if (!row) throw new UnauthorizedException();
    return row;
  }

  /** Health heartbeat from an adapter. Risk: read; high-frequency, so not written to the activity log. */
  async reportHealth(header: string | undefined, body: unknown): Promise<AdapterSummary> {
    const adapter = await this.authenticate(header);
    if (!adapter.scopes.includes(HEALTH_REPORT_SCOPE)) throw new UnauthorizedException();
    const report = parseBody(AdapterHealthReportSchema, body);
    return toSummary(await this.repo.recordHealth(adapter.id, report.status, report.detail ?? null));
  }

  /** Looks an adapter up by name (used by the action queue to read its declared actions). */
  find(name: string): Promise<AdapterRecord | undefined> {
    return this.repo.findByName(name);
  }

  /**
   * Replaces a registered adapter's manifest and scopes, keeping its token. Owner only. Risk: privileged, because
   * the manifest fixes each action's risk level. Needed when an adapter gains actions (LT-13).
   */
  async updateManifest(name: string, body: unknown): Promise<AdapterSummary> {
    const base = (outcome: NewActivity['outcome'], details: Record<string, unknown>): NewActivity => ({
      actorType: 'owner',
      actorId: 'owner',
      action: 'adapter.manifest.update',
      risk: 'privileged',
      targetType: 'adapter',
      targetId: name,
      outcome,
      details,
    });
    const result = validateManifest(body);
    if (!result.ok) {
      await this.activity.record(base('denied', { errors: result.errors }));
      throw new BadRequestException({ message: 'invalid adapter manifest', errors: result.errors });
    }
    const existing = await this.repo.findByName(name);
    if (!existing) throw new NotFoundException(`adapter ${name} is not registered`);
    if (result.manifest.name !== name) throw new BadRequestException('manifest name does not match the adapter');
    const scopes = scopesForManifest(result.manifest);
    const row = await this.repo.updateManifest(existing.id, result.manifest, scopes);
    await this.activity.record(
      base('success', {
        version: result.manifest.version,
        actions: (result.manifest.actions ?? []).map((a) => `${a.name}:${a.risk}`),
        previousActions: (existing.manifest.actions ?? []).map((a) => `${a.name}:${a.risk}`),
      }),
    );
    return toSummary(row);
  }

  /** Owner view of every registered adapter. Risk: read. */
  async list(): Promise<AdapterSummary[]> {
    return (await this.repo.list()).map(toSummary);
  }
}
