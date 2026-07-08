import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ResumeService } from '../resume/resume.service';

/**
 * R-073 — email-only support recovery for "paid but couldn't download".
 *
 * A support agent (admin-guarded) can:
 *   1. look up a per-download payment by buyer email / resumeId / order id,
 *      seeing its status, which resume it paid for, and whether the resume
 *      was ever delivered (fulfilledAt + the ResumeEmailLog trail);
 *   2. re-send that exact resume to the buyer's email as a PDF or DOCX
 *      attachment — rendering it fresh, with no re-charge and no quota hit.
 *
 * This is the human safety net for the failure the founder flagged: the
 * money was captured but the file never reached the user.
 */
@Injectable()
export class SupportRecoveryService {
  private readonly logger = new Logger(SupportRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly resumeService: ResumeService,
  ) {}

  /** Find per-download payments by email, resumeId, or provider order id. */
  async lookupPayments(query: { email?: string; resumeId?: string; orderId?: string }) {
    const email = String(query.email || '').trim().toLowerCase();
    const resumeId = String(query.resumeId || '').trim();
    const orderId = String(query.orderId || '').trim();
    if (!email && !resumeId && !orderId) {
      throw new BadRequestException('Provide at least one of: email, resumeId, orderId.');
    }

    const or: Record<string, unknown>[] = [];
    if (resumeId) or.push({ resumeId });
    if (orderId) or.push({ providerOrderId: orderId });
    if (email) {
      or.push({ email });
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (user) or.push({ userId: user.id });
    }

    const payments = await this.prisma.paymentHistory.findMany({
      where: { planType: 'DOWNLOAD', OR: or },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const results = [];
    for (const p of payments) {
      const rid = p.resumeId || null;
      const resume = rid
        ? await this.prisma.resume.findUnique({ where: { id: rid }, select: { title: true, userId: true } })
        : null;
      const buyer = await this.prisma.user.findUnique({ where: { id: p.userId }, select: { email: true } });
      const lastEmail = rid
        ? await (this.prisma as any).resumeEmailLog.findFirst({
            where: { resumeId: rid },
            orderBy: { createdAt: 'desc' },
          })
        : null;
      results.push({
        paymentId: p.id,
        status: p.status,
        amountPaise: p.amountPaise,
        currency: p.currency,
        provider: p.paymentProvider,
        providerOrderId: p.providerOrderId,
        providerPaymentId: p.providerPaymentId,
        userId: p.userId,
        buyerEmail: p.email || buyer?.email || null,
        resumeId: rid,
        resumeTitle: resume?.title || null,
        fulfilled: Boolean(p.fulfilledAt),
        fulfilledAt: p.fulfilledAt ? p.fulfilledAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        lastEmail: lastEmail
          ? { status: lastEmail.status, kind: lastEmail.kind, at: lastEmail.createdAt.toISOString() }
          : null,
        // A captured payment that was never delivered = needs a resend.
        needsResend: p.status === 'captured' && !p.fulfilledAt,
      });
    }
    return { count: results.length, payments: results };
  }

  /**
   * Re-send a paid resume to the buyer by email. Resolve the target from a
   * paymentId (preferred) or an explicit userId+resumeId. Renders the resume
   * fresh (no quota charge), emails it, records the delivery, and stamps the
   * payment fulfilled.
   */
  async resend(params: {
    paymentId?: string;
    userId?: string;
    resumeId?: string;
    format?: 'pdf' | 'docx';
    to?: string;
  }) {
    const format: 'pdf' | 'docx' = params.format === 'docx' ? 'docx' : 'pdf';

    let userId = String(params.userId || '').trim();
    let resumeId = String(params.resumeId || '').trim();
    let email = String(params.to || '').trim();

    if (params.paymentId) {
      const payment = await this.prisma.paymentHistory.findUnique({
        where: { id: String(params.paymentId).trim() },
      });
      if (!payment) throw new NotFoundException('Payment not found.');
      userId = payment.userId;
      resumeId = payment.resumeId || resumeId;
      if (!email) email = payment.email || '';
    }

    if (!userId || !resumeId) {
      throw new BadRequestException('Could not resolve which resume to resend (need paymentId, or userId + resumeId).');
    }

    // Fall back to the account email if support didn't override the address.
    if (!email) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      email = user?.email || '';
    }
    if (!email) throw new BadRequestException('No email on file for this buyer; pass an explicit "to" address.');

    if (!this.mail.isConfigured) {
      throw new BadRequestException('Email is not configured on this server (SMTP missing).');
    }

    // Render fresh — bypasses the export quota, no re-charge.
    let buffer: Buffer;
    let resumeTitle = 'Resume';
    try {
      const resume = await this.prisma.resume.findFirst({
        where: { id: resumeId, userId },
        select: { title: true },
      });
      resumeTitle = (resume?.title && String(resume.title).trim()) || 'Resume';
      if (format === 'docx') {
        buffer = await this.resumeService.generateDocxBypassingQuota(userId, resumeId);
      } else {
        const pdf = await this.resumeService.generatePdfBypassingQuota(userId, resumeId);
        buffer = Buffer.isBuffer(pdf) ? (pdf as Buffer) : Buffer.from(pdf as unknown as ArrayBuffer);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Could not render the resume for resend: ${msg}`);
    }

    const contentType =
      format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';
    const sent = await this.mail.sendResumePdfEmail({
      to: email,
      resumeTitle,
      pdfBuffer: buffer,
      fileName: `resume-${resumeId}.${format}`,
      contentType,
      intro: `As requested, here is your resume "${resumeTitle}" attached. Our support team is re-sending your paid copy.`,
    });

    await this.recordEmail(userId, resumeId, email, 'admin_resend', sent ? 'sent' : 'failed', sent ? null : 'send returned false');
    if (sent) await this.markFulfilled(userId, resumeId);
    else this.logger.error(`Support resend failed to email ${email} for resume ${resumeId}`);

    return { sent, to: email, resumeId, format };
  }

  private async recordEmail(
    userId: string,
    resumeId: string,
    email: string,
    kind: string,
    status: 'sent' | 'failed' | 'skipped',
    error: string | null,
  ): Promise<void> {
    try {
      await (this.prisma as any).resumeEmailLog.create({
        data: { userId, resumeId, email, kind, status, error: error || null },
      });
    } catch {
      // audit only
    }
  }

  private async markFulfilled(userId: string, resumeId: string): Promise<void> {
    try {
      const latest = await this.prisma.paymentHistory.findFirst({
        where: { userId, resumeId, planType: 'DOWNLOAD', status: 'captured', fulfilledAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (latest) {
        await this.prisma.paymentHistory.update({ where: { id: latest.id }, data: { fulfilledAt: new Date() } });
      }
    } catch {
      // non-critical
    }
  }
}
