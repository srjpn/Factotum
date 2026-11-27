import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AdapterRegistration, AdapterSummary } from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { AdaptersService } from './adapters.service.js';

@Controller('adapters')
export class AdaptersController {
  constructor(@Inject(AdaptersService) private readonly adapters: AdaptersService) {}

  @Post('register')
  @UseGuards(AdminGuard)
  register(@Body() body: unknown): Promise<AdapterRegistration> {
    return this.adapters.register(body);
  }

  /** Owner only: replace a registered adapter's manifest (for example after it gained write actions). */
  @Put(':name/manifest')
  @UseGuards(AdminGuard)
  updateManifest(@Param('name') name: string, @Body() body: unknown): Promise<AdapterSummary> {
    return this.adapters.updateManifest(name, body);
  }

  /** Called by the adapter itself with its service token. */
  @Post('health')
  @HttpCode(200)
  health(@Headers('authorization') auth: string | undefined, @Body() body: unknown): Promise<AdapterSummary> {
    return this.adapters.reportHealth(auth, body);
  }

  @Get()
  @UseGuards(AdminGuard)
  list(): Promise<AdapterSummary[]> {
    return this.adapters.list();
  }
}
