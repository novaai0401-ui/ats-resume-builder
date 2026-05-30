import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { TrainingDatasetService } from './training-dataset.service';

interface AuthedReq { user: { userId: string } }

/**
 * Two surfaces:
 *   - User-facing: consent toggle + purge.
 *   - Admin: stats + JSONL export.
 *
 * Capture endpoints are intentionally NOT exposed — capture is internal,
 * triggered by the resume upload + save flows. Exposing it would let
 * callers seed arbitrary text into the training corpus.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class TrainingDatasetController {
  constructor(private readonly service: TrainingDatasetService) {}

  @Get('me/training-consent')
  getConsent(@Req() req: AuthedReq) {
    return this.service.getConsent(req.user.userId);
  }

  @Patch('me/training-consent')
  async setConsent(@Req() req: AuthedReq, @Body() body: { enabled?: unknown }) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    await this.service.setConsent(req.user.userId, body.enabled);
    return { ok: true, enabled: body.enabled };
  }

  /**
   * Mark the one-time training-data notice as seen. The client calls
   * this after the user acknowledges the explanatory modal on first
   * login (or first visit after policy bump). Idempotent.
   */
  @Post('me/training-consent/notice-seen')
  ackNotice(@Req() req: AuthedReq) {
    return this.service.acknowledgeNotice(req.user.userId);
  }

  @Delete('me/training-samples')
  purge(@Req() req: AuthedReq) {
    return this.service.purgeUserSamples(req.user.userId);
  }

  @Get('admin/training-dataset/stats')
  @UseGuards(AdminAuthGuard)
  stats(@Req() req: AuthedReq) {
    void req; // guard already enforces admin
    return this.service.stats();
  }

  @Get('admin/training-dataset/export.jsonl')
  @UseGuards(AdminAuthGuard)
  @Header('Content-Type', 'application/x-ndjson')
  @Header('Content-Disposition', 'attachment; filename="training.jsonl"')
  async export(@Res() res: Response) {
    const body = await this.service.exportLabeledJsonl();
    res.send(body);
  }

  /**
   * Upload one ModelEvaluation row. Called by training/evaluate.py
   * after a run completes so the metrics history lives next to the
   * dataset that produced them.
   */
  @Post('admin/training-dataset/evaluations')
  @UseGuards(AdminAuthGuard)
  async recordEvaluation(@Body() body: {
    modelName?: string;
    modelVersion?: string;
    sampleCount?: number;
    metrics?: unknown;
    trainingNote?: string;
  }) {
    if (!body?.modelName || !body?.modelVersion || typeof body.sampleCount !== 'number' || !body.metrics) {
      throw new BadRequestException('modelName, modelVersion, sampleCount, metrics are required');
    }
    return this.service.recordEvaluation({
      modelName: body.modelName,
      modelVersion: body.modelVersion,
      sampleCount: body.sampleCount,
      metrics: body.metrics,
      trainingNote: body.trainingNote,
    });
  }
}
