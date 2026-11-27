import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { ActionClaim, ActionRun } from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { ActionRunsService } from './actions.service.js';

@Controller()
export class ActionRunsController {
  constructor(@Inject(ActionRunsService) private readonly runs: ActionRunsService) {}

  /** Owner: ask an adapter to run one of its declared actions. Applies the policy tier; returns the queued or waiting run. */
  @Post('actions/run')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  request(@Body() body: unknown): Promise<ActionRun> {
    return this.runs.request(body);
  }

  @Get('actions/runs')
  @UseGuards(AdminGuard)
  list(@Query('status') status?: string, @Query('adapter') adapter?: string): Promise<ActionRun[]> {
    return this.runs.list({ status, adapter });
  }

  @Get('actions/runs/:id')
  @UseGuards(AdminGuard)
  get(@Param('id') id: string): Promise<ActionRun> {
    return this.runs.get(id);
  }

  /** Adapter poll with its service token: the next queued run for it, or `{run: null}`. */
  @Post('adapters/actions/claim')
  @HttpCode(200)
  claim(@Headers('authorization') auth: string | undefined): Promise<ActionClaim> {
    return this.runs.claim(auth);
  }

  /** Adapter reports the outcome of a run it claimed. */
  @Post('adapters/actions/:id/result')
  @HttpCode(200)
  report(@Headers('authorization') auth: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<ActionRun> {
    return this.runs.report(auth, id, body);
  }
}
