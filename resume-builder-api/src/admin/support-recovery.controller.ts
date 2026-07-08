import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { SupportRecoveryService } from './support-recovery.service';

/**
 * R-073 — admin/support console for the "paid but couldn't download" case.
 * Admin-guarded (env-driven ADMIN_EMAILS / ADMIN_USER_IDS via AdminAuthGuard).
 */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class SupportRecoveryController {
  constructor(private readonly recovery: SupportRecoveryService) {}

  /** Look up per-download payments by email / resumeId / provider order id. */
  @Get('payments')
  lookup(
    @Query('email') email?: string,
    @Query('resumeId') resumeId?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.recovery.lookupPayments({ email, resumeId, orderId });
  }

  /** Re-send a paid resume to the buyer by email (PDF or DOCX). */
  @Post('resend')
  resend(
    @Body()
    body: {
      paymentId?: string;
      userId?: string;
      resumeId?: string;
      format?: 'pdf' | 'docx';
      to?: string;
    },
  ) {
    return this.recovery.resend({
      paymentId: body?.paymentId,
      userId: body?.userId,
      resumeId: body?.resumeId,
      format: body?.format,
      to: body?.to,
    });
  }
}
