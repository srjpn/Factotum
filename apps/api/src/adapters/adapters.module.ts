import { Module } from '@nestjs/common';
import { ADAPTER_REPOSITORY } from './adapter.repository.js';
import { AdaptersController } from './adapters.controller.js';
import { AdaptersService } from './adapters.service.js';
import { PgAdapterRepository } from './pg-adapter.repository.js';

/**
 * Adapter registry. Relies on POOL, CONFIG (for AdminGuard) and ActivityService,
 * which AppModule exports globally.
 */
@Module({
  controllers: [AdaptersController],
  providers: [AdaptersService, { provide: ADAPTER_REPOSITORY, useClass: PgAdapterRepository }],
  exports: [AdaptersService],
})
export class AdaptersModule {}
