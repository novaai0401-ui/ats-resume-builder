import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SahaayakService } from './sahaayak.service';
import type { SahaayakMode } from './sahaayak.prompt';

interface AuthedReq { user: { userId: string } }

@Controller('sahaayak')
@UseGuards(JwtAuthGuard)
export class SahaayakController {
  constructor(private readonly service: SahaayakService) {}

  @Get('profile')
  profile(@Req() req: AuthedReq) {
    return this.service.getProfile(req.user.userId).then((p) => p ?? { optedIn: false });
  }

  @Post('opt-in')
  optIn(@Req() req: AuthedReq, @Body() body: { mode?: SahaayakMode; guardrails?: string }) {
    return this.service.optIn(req.user.userId, body?.mode ?? 'witness', body?.guardrails);
  }

  @Post('opt-out')
  optOut(@Req() req: AuthedReq) {
    return this.service.optOut(req.user.userId);
  }

  @Delete('memory')
  forget(@Req() req: AuthedReq) {
    return this.service.forget(req.user.userId);
  }

  @Post('chat')
  chat(
    @Req() req: AuthedReq & { headers?: Record<string, string | string[]> },
    @Body() body: { message?: string; region?: string },
  ) {
    const message = String(body?.message || '').trim();
    if (!message) throw new BadRequestException('message is required');
    // BYOK headers are optional. If a free-tier user has pasted their
    // own AI key in Settings, the client sends X-User-AI-Provider +
    // X-User-AI-Key on every chat request. We use the key for exactly
    // ONE upstream call and never persist or log it (see byok-factory).
    const headers = req.headers || {};
    const headerValue = (name: string) => {
      const v = headers[name] ?? headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    };
    const byokProvider = headerValue('x-user-ai-provider');
    const byokKey = headerValue('x-user-ai-key');
    return this.service.chat(req.user.userId, message, {
      region: body?.region,
      byokProvider,
      byokKey,
    });
  }

  @Get('messages')
  messages(@Req() req: AuthedReq, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.service.listMessages(req.user.userId, Number.isFinite(n) ? n : 30);
  }

  @Post('events')
  recordEvent(@Req() req: AuthedReq, @Body() body: {
    kind?: string;
    payload?: unknown;
    note?: string;
    moodRating?: number;
    occurredAt?: string;
  }) {
    if (!body?.kind) throw new BadRequestException('kind is required');
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : undefined;
    return this.service.recordEvent(req.user.userId, body.kind, body.payload, {
      note: body.note,
      moodRating: body.moodRating,
      occurredAt,
    });
  }

  @Get('events')
  events(@Req() req: AuthedReq, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.service.listEvents(req.user.userId, Number.isFinite(n) ? n : 50);
  }

  @Get('check-in')
  checkIn(@Req() req: AuthedReq) {
    return this.service.checkInPrompt(req.user.userId);
  }
}
