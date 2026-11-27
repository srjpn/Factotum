import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type pg from 'pg';
import { AppModule } from './app.module.js';
import { CONFIG } from './auth/admin.guard.js';
import type { Config } from './config.js';
import { POOL } from './db/db.js';
import { runMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const applied = await runMigrations(app.get<pg.Pool>(POOL));
  if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);
  await app.listen(app.get<Config>(CONFIG).port, '0.0.0.0');
}

void main();
