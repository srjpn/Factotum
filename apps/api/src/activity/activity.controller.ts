import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { ActivityEntry } from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ActivityService } from './activity.service.js';

// Read-only on purpose: entries cannot be edited or deleted through the API.
@Controller('activity')
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get()
  @UseGuards(AdminGuard)
  list(@Query('limit') limit?: string): Promise<ActivityEntry[]> {
    const n = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    return this.activity.list(n);
  }
}
