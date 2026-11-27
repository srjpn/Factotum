import { Module } from '@nestjs/common';
import { ActivityController } from './activity/activity.controller.js';
import { ActivityService } from './activity/activity.service.js';
import { AdminGuard, CONFIG } from './auth/admin.guard.js';
import { loadConfig, type Config } from './config.js';
import { createPool, POOL } from './db/db.js';
import { HealthController } from './health.controller.js';
import { NodesController } from './nodes/nodes.controller.js';
import { NodeStatusMonitor } from './nodes/node-status.monitor.js';
import { NodesService } from './nodes/nodes.service.js';

@Module({
  controllers: [HealthController, NodesController, ActivityController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: POOL, inject: [CONFIG], useFactory: (config: Config) => createPool(config.databaseUrl) },
    ActivityService,
    NodesService,
    NodeStatusMonitor,
    AdminGuard,
  ],
})
export class AppModule {}
