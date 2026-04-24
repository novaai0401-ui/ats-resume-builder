import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobsService, type JobApplicationInput } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }, @Query('status') status?: string) {
    return this.jobs.list(req.user.userId, status);
  }

  @Get('stats')
  stats(@Req() req: { user: { userId: string } }) {
    return this.jobs.stats(req.user.userId);
  }

  @Get('upcoming')
  upcoming(@Req() req: { user: { userId: string } }, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 14;
    const horizon = Number.isFinite(parsed) && parsed > 0 && parsed <= 180 ? parsed : 14;
    return this.jobs.upcoming(req.user.userId, horizon);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: JobApplicationInput) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.jobs.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: JobApplicationInput,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.jobs.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.jobs.remove(req.user.userId, id);
  }
}
