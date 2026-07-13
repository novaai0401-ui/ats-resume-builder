import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AiHealthService, buildAiHint } from './ai-health.service';

/**
 * R-085 — admin AI-key diagnostics. Answers "is the Groq key we added
 * actually working?" without shelling into Render: config snapshot +
 * a live Groq handshake, with an actionable hint. Admin-only; never
 * exposes the key.
 */
@SkipThrottle()
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class AiStatusController {
  constructor(private readonly aiHealth: AiHealthService) {}

  /** Config snapshot (no secrets) + a live Groq handshake. */
  @Get('status')
  async status() {
    const status = this.aiHealth.getStatus();
    const verify = await this.aiHealth.verify();
    return {
      ...status,
      reachable: verify.ok,
      error: verify.error,
      latencyMs: verify.latencyMs,
      hint: buildAiHint(status, verify),
    };
  }

  /** Alias for parity with admin/mail/test — same live handshake. */
  @Post('test')
  async test() {
    const status = this.aiHealth.getStatus();
    const verify = await this.aiHealth.verify();
    return { ok: verify.ok, model: verify.model, latencyMs: verify.latencyMs, error: verify.error, hint: buildAiHint(status, verify) };
  }
}
