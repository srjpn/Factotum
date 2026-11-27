import { Global, Module } from '@nestjs/common';
import { ActivityController } from './activity/activity.controller.js';
import { ActivityService } from './activity/activity.service.js';
import { AdaptersModule } from './adapters/adapters.module.js'; // LT-5
import { AdminGuard, CONFIG } from './auth/admin.guard.js';
import { loadConfig, type Config } from './config.js';
import { createPool, POOL } from './db/db.js';
import { InventoryModule } from './inventory/inventory.module.js'; // LT-5b
import { HealthController } from './health.controller.js';
import { NodesController } from './nodes/nodes.controller.js';
import { NodesService } from './nodes/nodes.service.js';

// Global so feature modules (adapters) can use the pool, config and activity log.
@Global()
@Module({
  imports: [AdaptersModule, InventoryModule], // LT-5 adapter registry, LT-5b inventory
  controllers: [HealthController, NodesController, ActivityController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: POOL, inject: [CONFIG], useFactory: (config: Config) => createPool(config.databaseUrl) },
    ActivityService,
    NodesService,
    AdminGuard,
  ],
  exports: [CONFIG, POOL, ActivityService, AdminGuard],
})
export class AppModule {}
