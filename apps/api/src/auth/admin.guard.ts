import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Config } from '../config.js';
import { bearerToken, secretsMatch } from '../secrets.js';

export const CONFIG = Symbol('CONFIG');

// Interim owner check using FACTO_ADMIN_TOKEN. Real login replaces this in LT-6.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const token = bearerToken(request.headers['authorization']);
    if (!token || !secretsMatch(token, this.config.adminToken)) {
      throw new UnauthorizedException('owner credential required');
    }
    return true;
  }
}
