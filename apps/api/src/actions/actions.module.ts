import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module.js';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { ActionRunsController } from './actions.controller.js';
import { ActionRunsService } from './actions.service.js';

// LT-13. Relies on POOL, CONFIG and ActivityService from the global AppModule.
@Module({
  imports: [AdaptersModule, ApprovalsModule],
  controllers: [ActionRunsController],
  providers: [ActionRunsService],
})
export class ActionRunsModule {}
