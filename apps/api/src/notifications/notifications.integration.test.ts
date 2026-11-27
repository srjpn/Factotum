import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { CONFIG } from '../auth/admin.guard.js';
import { createPool, POOL } from '../db/db.js';
import { runMigrations } from '../db/migrate.js';
import { NodeStatusMonitor } from '../nodes/node-status.monitor.js';
import { NodesService } from '../nodes/nodes.service.js';

// Runs against a real Postgres (FACTO_TEST_DATABASE_URL) and a mock ntfy server. Never contacts a real ntfy.
const url = process.env['FACTO_TEST_DATABASE_URL'];

describe.skipIf(!url)('notifications (real Postgres, mock ntfy)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let ntfy: Server;
  const received: { url?: string; title?: string; body: string }[] = [];

  const waitFor = async (cond: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 50; i++) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('timed out');
  };

  beforeAll(async () => {
    ntfy = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ url: req.url, title: req.headers['title'] as string, body });
        res.end('{}');
      });
    });
    await new Promise<void>((r) => ntfy.listen(0, '127.0.0.1', r));
    const ntfyUrl = `http://127.0.0.1:${(ntfy.address() as AddressInfo).port}`;

    const schema = `test_${randomBytes(6).toString('hex')}`;
    const admin = createPool(url!);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    pool = createPool(url!, schema);
    await runMigrations(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({
        port: 0,
        databaseUrl: url!,
        adminToken: 'test-admin-token-with-enough-length',
        offlineAfterSeconds: 90,
        statusCheckSeconds: 0,
        ntfy: { url: ntfyUrl, topic: 'facto-test' },
      })
      .overrideProvider(POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await new Promise<void>((r) => ntfy.close(() => r()));
  });

  it('sends exactly one notification when a node goes offline, and logs the send without looping', async () => {
    const nodes = app.get(NodesService);
    const monitor = app.get(NodeStatusMonitor);
    const { token } = await nodes.createEnrolmentToken({ nodeName: 'laptop-n', ttlMinutes: 10 });
    const { nodeId } = await nodes.enrol(token);
    await pool.query("UPDATE nodes SET last_heartbeat_at = now() - interval '5 minutes', reported_status = 'online' WHERE id = $1", [nodeId]);
    await monitor.check();
    await monitor.check();

    await waitFor(() => received.length >= 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ url: '/facto-test', title: 'Node offline' });
    expect(received[0]!.body).toContain('laptop-n went offline');

    await waitFor(async () => {
      const { rows } = await pool.query("SELECT outcome, details FROM activity_log WHERE action = 'notification.send'");
      return rows.length === 1 && rows[0].outcome === 'success';
    });
  });
});
