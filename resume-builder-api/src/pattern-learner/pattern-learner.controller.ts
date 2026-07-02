import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PatternLearnerService } from './pattern-learner.service';
import { PatternModelService } from './pattern-model.service';

@Controller('admin/pattern-learner')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class PatternLearnerController {
  constructor(
    private readonly service: PatternLearnerService,
    private readonly patternModel: PatternModelService,
  ) {}

  /** Train the self-learning resume-pattern-model over the redacted corpus. */
  @Post('model/train')
  trainModel() {
    return this.patternModel.train();
  }

  /** Latest pattern-model snapshot stats (no payload). */
  @Get('model/stats')
  modelStats() {
    return this.patternModel.stats();
  }

  /** Download the latest trained model JSON (embeddable library asset). */
  @Get('model/latest')
  latestModel() {
    return this.patternModel.getLatestSnapshot();
  }

  @Get('failures')
  listFailures(@Query('status') status?: string, @Query('limit') limit?: string) {
    const lim = limit ? Number(limit) : undefined;
    return this.service.listFailures({ status, limit: Number.isFinite(lim) ? lim : undefined });
  }

  @Get('patterns')
  listPatterns(@Query('status') status?: string) {
    return this.service.listPatterns({ status });
  }

  @Post('failures/:id/propose')
  async propose(@Param('id') id: string, @Body() body: { kind?: string }) {
    const kind = String(body?.kind || '').trim();
    if (!kind) throw new BadRequestException('kind is required');
    return this.service.proposeForSample(id, kind);
  }

  @Post('patterns/:id/promote')
  promote(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.service.promote(id, req.user.userId);
  }

  @Post('patterns/:id/reject')
  reject(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.service.reject(id, req.user.userId);
  }

  @Post('patterns/:id/rollback')
  rollback(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.service.rollback(id, req.user.userId);
  }
}
