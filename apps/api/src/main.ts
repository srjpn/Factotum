import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  await app.listen(config.port, '0.0.0.0');
}

void main();
