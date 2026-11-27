import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  CreateEnrolmentTokenRequestSchema,
  EnrolRequestSchema,
  HeartbeatSchema,
  type EnrolmentTokenResponse,
  type EnrolResponse,
  type Node,
} from '@facto/contracts';
import { AdminGuard } from '../auth/admin.guard.js';
import { parseBody } from '../http.js';
import { bearerToken } from '../secrets.js';
import { NodesService } from './nodes.service.js';

@Controller('nodes')
export class NodesController {
  constructor(@Inject(NodesService) private readonly nodes: NodesService) {}

  @Post('enrolment-tokens')
  @UseGuards(AdminGuard)
  createEnrolmentToken(@Body() body: unknown): Promise<EnrolmentTokenResponse> {
    return this.nodes.createEnrolmentToken(parseBody(CreateEnrolmentTokenRequestSchema, body));
  }

  @Post('enrol')
  enrol(@Body() body: unknown): Promise<EnrolResponse> {
    return this.nodes.enrol(parseBody(EnrolRequestSchema, body).token);
  }

  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<void> {
    // Authenticate before validating the body so unknown credentials always get 401.
    const nodeId = await this.nodes.authenticate(bearerToken(authorization));
    await this.nodes.recordHeartbeat(nodeId, parseBody(HeartbeatSchema, body));
  }

  @Get()
  @UseGuards(AdminGuard)
  list(): Promise<Node[]> {
    return this.nodes.list();
  }

  @Post(':id/revoke')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.nodes.revoke(id);
  }
}
