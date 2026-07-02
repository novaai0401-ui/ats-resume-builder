import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobAlertsService } from './job-alerts.service';

@Controller('job-alerts')
export class JobAlertsController {
  constructor(private readonly service: JobAlertsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: { user: { userId: string } }) {
    return this.service.list(req.user.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: { user: { userId: string } },
    @Body() body: { query?: string; location?: string },
  ) {
    return this.service.create(req.user.userId, body || {});
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.userId, id);
  }

  /**
   * Cron entry point — same CRON_SECRET pattern as the outcome-nudge cron
   * (Render Cron Job hits it on a schedule; header `x-cron-secret`).
   */
  @Post('run-cron')
  @HttpCode(200)
  runCron(@Req() req: Request) {
    const configured = String(process.env.CRON_SECRET || '').trim();
    const provided = String(req.headers['x-cron-secret'] || '').trim();
    if (!configured || provided !== configured) {
      throw new ForbiddenException('Invalid cron secret.');
    }
    return this.service.runAll();
  }
}
