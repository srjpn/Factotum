import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { PrivacyCheckResult } from '@facto/contracts';
import { AdminGuard, CONFIG } from '../auth/admin.guard.js';
import type { Config } from '../config.js';
import { PrivacyService } from './privacy.service.js';

@Controller('privacy')
export class PrivacyController {
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Owner credential or an adapter token. Always 200; read `decision`. A `deny` is logged and final. */
  @Post('check')
  @HttpCode(200)
  check(@Headers('authorization') auth: string | undefined, @Body() body: unknown): Promise<PrivacyCheckResult> {
    return this.privacy.checkRequest(auth, body);
  }

  /** The configured allowed-targets lists (owner only), so the dashboard can show them. */
  @Get('policy')
  @UseGuards(AdminGuard)
  policy(): Record<string, readonly string[] | '*'> {
    return { ...this.config.privacy };
  }
}
