import { Global, Module } from '@nestjs/common';
import { ActivityController } from './activity/activity.controller.js';
import { ActivityService } from './activity/activity.service.js';
import { AdaptersModule } from './adapters/adapters.module.js'; // LT-5
import { AdminGuard, CONFIG } from './auth/admin.guard.js';
import { loadConfig, type Config } from './config.js';
import { createPool, POOL } from './db/db.js';
import { InventoryModule } from './inventory/inventory.module.js'; // LT-5b
import { ApprovalsModule } from './approvals/approvals.module.js'; // LT-11
import { ActionRunsModule } from './actions/actions.module.js'; // LT-13
import { PrivacyModule } from './privacy/privacy.module.js'; // LT-12
import { HealthController } from './health.controller.js';
import { NodesController } from './nodes/nodes.controller.js';
import { NodeStatusMonitor } from './nodes/node-status.monitor.js';
import { NodesService } from './nodes/nodes.service.js';
import { NotifierService } from './notifications/notifier.service.js';

// Global so feature modules (adapters) can use the pool, config and activity log.
@Global()
@Module({
  imports: [AdaptersModule, InventoryModule, ApprovalsModule, PrivacyModule, ActionRunsModule], // LT-5 adapters, LT-5b inventory, LT-11 approvals, LT-12 privacy, LT-13 actions
  controllers: [HealthController, NodesController, ActivityController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: POOL, inject: [CONFIG], useFactory: (config: Config) => createPool(config.databaseUrl) },
    ActivityService,
    NodesService,
    NodeStatusMonitor,
    NotifierService,
    AdminGuard,
  ],
  exports: [CONFIG, POOL, ActivityService, AdminGuard],
})
export class AppModule {}
