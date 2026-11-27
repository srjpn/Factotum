import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { InventoryItem, InventorySyncResult } from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { InventoryService } from './inventory.service.js';

@Controller()
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  /** Called by an adapter with its service token; body is a full snapshot of one kind. */
  @Put('adapters/inventory/:kind')
  @HttpCode(200)
  sync(
    @Headers('authorization') auth: string | undefined,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<InventorySyncResult> {
    return this.inventory.sync(auth, kind, body);
  }

  @Get('inventory')
  @UseGuards(AdminGuard)
  list(
    @Query('kind') kind?: string,
    @Query('source') source?: string,
    @Query('privacy') privacy?: string,
  ): Promise<InventoryItem[]> {
    return this.inventory.list({ kind, source, privacy });
  }
}
