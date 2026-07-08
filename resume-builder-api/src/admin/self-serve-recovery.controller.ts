import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupportRecoveryService } from './support-recovery.service';

/**
 * R-073 — user-facing self-serve recovery for "I paid but never got my
 * download." The signed-in user gives us their resume name and/or payment
 * id; if they truly paid for it, we email the resume straight from the DB
 * to their account address. No support agent, no re-charge.
 *
 * JwtAuthGuard only (NOT admin): scoped to the caller's own account and
 * gated on a real paid entitlement inside the service.
 */
@Controller('download-recovery')
@UseGuards(JwtAuthGuard)
export class SelfServeRecoveryController {
  constructor(private readonly recovery: SupportRecoveryService) {}

  /** Email me the resume I already paid for. */
  @Post('email-copy')
  emailCopy(
    @Req() req: { user: { userId: string } },
    @Body()
    body: { resumeId?: string; paymentId?: string; resumeName?: string; format?: 'pdf' | 'docx' },
  ) {
    return this.recovery.selfServeResend({
      userId: req.user.userId,
      resumeId: body?.resumeId,
      paymentId: body?.paymentId,
      resumeName: body?.resumeName,
      format: body?.format,
    });
  }
}
