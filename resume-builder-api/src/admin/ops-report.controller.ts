import { Controller, ForbiddenException, HttpCode, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Daily spend tripwire (business item 4): one plain-text email a day with the
 * numbers that turn into surprises when unwatched — AI usage, download
 * revenue, signups, active paid plans. The failure mode this prevents is
 * discovering a bill or an abuse pattern a month late.
 *
 * Cron-triggered like the nudge/job-alert endpoints (Render Cron hits it with
 * the shared x-cron-secret) — no new auth surface. Numbers cover YESTERDAY
 * (server time), so each mail is a closed day, not a moving snapshot.
 *
 * AI cost is an estimate on purpose: tokensUsed is chars/4 and pricing drifts.
 * The estimate exists to make a TREND legible, not to reconcile an invoice —
 * the Groq console stays the source of truth for billing.
 */

/** Rough blended Groq cost per 1M tokens, in paise (~$0.30 ≈ ₹25 at the 8B/70B
 *  mix routing produces). Tunable via AI_COST_PER_MTOK_PAISE. */
const DEFAULT_COST_PER_MTOK_PAISE = 2500;

@SkipThrottle()
@Controller('admin/ops')
export class OpsReportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Post('daily-report')
  @HttpCode(200)
  async dailyReport(@Req() req: Request) {
    const configured = String(process.env.CRON_SECRET || '').trim();
    const provided = String(req.headers['x-cron-secret'] || '').trim();
    if (!configured || provided !== configured) {
      throw new ForbiddenException('Invalid cron secret.');
    }

    const to = String(process.env.OPS_REPORT_EMAIL || 'novaai0401@gmail.com').trim();
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const range = { gte: start, lt: end };

    const [aiAgg, aiByFeature, downloads, signups, paidPlans, monthAi] = await Promise.all([
      this.prisma.aiTokenUsage.aggregate({
        where: { createdAt: range },
        _sum: { tokensUsed: true },
        _count: true,
      }),
      this.prisma.aiTokenUsage.groupBy({
        by: ['featureType'],
        where: { createdAt: range },
        _count: true,
        _sum: { tokensUsed: true },
      }),
      this.prisma.paymentHistory.aggregate({
        where: { createdAt: range, status: 'captured' },
        _sum: { amountPaise: true },
        _count: true,
      }),
      this.prisma.user.count({ where: { createdAt: range } }),
      this.prisma.user.count({ where: { plan: { not: 'FREE' } } }),
      this.prisma.aiTokenUsage.aggregate({
        where: { createdAt: { gte: new Date(end.getFullYear(), end.getMonth(), 1) } },
        _sum: { tokensUsed: true },
      }),
    ]);

    const costPerMtok = parseInt(
      String(process.env.AI_COST_PER_MTOK_PAISE || DEFAULT_COST_PER_MTOK_PAISE),
      10,
    );
    const tokens = aiAgg._sum.tokensUsed ?? 0;
    const aiCostPaise = Math.round((tokens / 1_000_000) * costPerMtok);
    const revenuePaise = downloads._sum.amountPaise ?? 0;
    const day = start.toISOString().slice(0, 10);

    const lines = [
      `CallbackCV daily report — ${day}`,
      '',
      `AI calls (our key): ${aiAgg._count}  ·  tokens: ${tokens.toLocaleString()}  ·  est. cost: ₹${(aiCostPaise / 100).toFixed(2)}`,
      ...aiByFeature.map(
        (f) => `  - ${f.featureType}: ${f._count} calls, ${(f._sum.tokensUsed ?? 0).toLocaleString()} tokens`,
      ),
      '',
      `Payments captured: ${downloads._count}  ·  revenue: ₹${(revenuePaise / 100).toFixed(2)}`,
      `New signups: ${signups}`,
      `Active paid plans (total): ${paidPlans}`,
      `Month-to-date AI tokens: ${(monthAi._sum.tokensUsed ?? 0).toLocaleString()}`,
      '',
      'Est. AI cost is chars/4 tokens at a blended rate — a trend line, not an invoice.',
    ];

    const sent = await this.mail.sendOpsReportEmail({
      to,
      subject: `CallbackCV daily: ₹${(revenuePaise / 100).toFixed(0)} revenue, ${aiAgg._count} AI calls (${day})`,
      text: lines.join('\n'),
    });

    // Return the numbers too, so the cron log itself is a readable record even
    // if SMTP is down.
    return { ok: true, mailed: sent, day, tokens, aiCalls: aiAgg._count, revenuePaise, signups };
  }
}
