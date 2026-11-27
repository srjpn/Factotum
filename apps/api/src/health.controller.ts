import { Controller, Get } from '@nestjs/common';
import type { Health } from '@facto/contracts';

@Controller('health')
export class HealthController {
  @Get()
  get(): Health {
    return { status: 'ok', service: 'api' };
  }
}
