import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeService } from '../resume/resume.service';
import { MailService } from '../mail/mail.service';

/**
 * Admin support escape hatch for "I paid but my download failed".
 *
 * Flow:
 *   1. User reports a failed export. They include the resumeId and
 *      (if available) the paymentId from the get-help link the editor
 *      surfaces on a download error.
 *   2. An admin opens the support route and POSTs the userId +
 *      resumeId. (The user-facing /resumes/:id/pdf path enforces rate
 *      limits, quota, and the free-plan block; this route bypasses
 *      all three because the user already paid — see the
 *      `bypassRestrictions` option on ResumeService.generatePdf.)
 *   3. We re-render the resume server-side and email the PDF to the
 *      user. Also log a SupportAction row so we have a tamper-evident
 *      record of every manual delivery.
 *
 * SECURITY: gated by JwtAuthGuard + AdminAuthGuard. Never expose the
 * `bypassRestrictions` flag through a user-facing route — that would
 * let a free-tier user skip the paywall by guessing this endpoint.
 */
@Controller('admin/support')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(
    private readonly resumeService: ResumeService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  @Post('regenerate-export')
  async regenerateExport(
    @Body() body: { userId?: string; resumeId?: string; reason?: string; templateId?: string },
  ) {
    const userId = String(body?.userId || '').trim();
    const resumeId = String(body?.resumeId || '').trim();
    const reason = String(body?.reason || '').trim().slice(0, 280);
    const templateId = body?.templateId ? String(body.templateId).trim() : undefined;
    if (!userId) throw new BadRequestException('userId is required');
    if (!resumeId) throw new BadRequestException('resumeId is required');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!user.email) {
      throw new BadRequestException(
        `User ${userId} has no email on file — cannot deliver the resume PDF.`,
      );
    }

    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
      select: { id: true, title: true },
    });
    if (!resume) {
      throw new NotFoundException(
        `Resume ${resumeId} not found for user ${userId}.`,
      );
    }

    // Bypass rate limit / quota / free-plan block — admin escape hatch.
    const pdfBuffer = await this.resumeService.generatePdf(
      userId,
      resumeId,
      templateId,
      { bypassRestrictions: true },
    );

    const resumeTitle = (resume.title || 'Resume').slice(0, 120);
    const safeBase = resumeTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'resume';
    const fileName = `${safeBase}.pdf`;

    // puppeteer returns Uint8Array on newer typings; nodemailer
    // accepts Buffer — normalise.
    const pdfAsBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const emailed = await this.mailService.sendResumePdfEmail({
      to: user.email,
      resumeTitle,
      pdfBuffer: pdfAsBuffer,
      fileName,
    });

    // Append to the support log. We don't have a SupportAction table
    // yet — log to the API logger for now so the support history is
    // recoverable from production logs.
    this.logger.log(
      `[support.force-export] resume=${resumeId} user=${userId} email=${user.email} delivered=${emailed} reason=${JSON.stringify(reason || '(unspecified)')}`,
    );

    return {
      ok: true,
      delivered: emailed,
      sentTo: user.email,
      resumeId,
      resumeTitle,
      pdfBytes: pdfAsBuffer.length,
      reason: reason || undefined,
    };
  }
}
