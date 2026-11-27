import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { ActionDecision, Approval } from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ApprovalsService } from './approvals.service.js';

@Controller()
export class ApprovalsController {
  constructor(@Inject(ApprovalsService) private readonly approvals: ApprovalsService) {}

  /** Owner credential or an adapter token. Returns `allowed` at once, or `pending` with the approval to poll. */
  @Post('actions/request')
  @HttpCode(200)
  request(@Headers('authorization') auth: string | undefined, @Body() body: unknown): Promise<ActionDecision> {
    return this.approvals.request(auth, body);
  }

  @Get('approvals')
  @UseGuards(AdminGuard)
  list(@Query('status') status?: string): Promise<Approval[]> {
    return this.approvals.list(status);
  }

  /** Owner, or the adapter that made the request. */
  @Get('approvals/:id')
  get(@Headers('authorization') auth: string | undefined, @Param('id') id: string): Promise<Approval> {
    return this.approvals.get(auth, id);
  }

  @Post('approvals/:id/approve')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  approve(@Param('id') id: string): Promise<Approval> {
    return this.approvals.approve(id);
  }

  @Post('approvals/:id/deny')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  deny(@Param('id') id: string): Promise<Approval> {
    return this.approvals.deny(id);
  }
}
