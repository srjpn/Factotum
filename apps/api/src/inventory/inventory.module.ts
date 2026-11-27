import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AdaptersModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
