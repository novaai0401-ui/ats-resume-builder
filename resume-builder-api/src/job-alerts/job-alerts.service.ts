import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LiveJobsService } from '../live-jobs/live-jobs.service';
import { MailService } from '../mail/mail.service';

/**
 * Saved job-search alerts (ADDITIVE — reuses the existing Adzuna
 * LiveJobsService + MailService):
 *
 *   1. A user saves a search ("react developer" in "Pune") — max 5 active.
 *   2. A CRON_SECRET-guarded endpoint re-runs every active alert (same
 *      pattern as the outcome-nudge cron, works with Render Cron Jobs).
 *   3. Openings the user has NOT been shown before (dedup by job URL,
 *      persisted in JobAlert.seenKeys) are emailed as a digest.
 *
 * Honesty: when Adzuna isn't configured, runAll() is a no-op that reports
 * skipped=all — it never pretends to have checked.
 */

const MAX_ALERTS_PER_USER = 5;
const MAX_SEEN_KEYS = 300;
const OPENINGS_PER_RUN = 8;

@Injectable()
export class JobAlertsService {
  private readonly logger = new Logger(JobAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveJobs: LiveJobsService,
    private readonly mail: MailService,
  ) {}

  async create(userId: string, input: { query?: string; location?: string }) {
    const query = String(input?.query || '').trim().slice(0, 120);
    const location = String(input?.location || '').trim().slice(0, 80) || null;
    if (query.length < 2) throw new BadRequestException('Search query is required.');
    const activeCount = await this.prisma.jobAlert.count({ where: { userId, active: true } });
    if (activeCount >= MAX_ALERTS_PER_USER) {
      throw new BadRequestException(`You can keep up to ${MAX_ALERTS_PER_USER} active alerts. Delete one first.`);
    }
    return this.prisma.jobAlert.create({
      data: { userId, query, location },
      select: { id: true, query: true, location: true, active: true, createdAt: true },
    });
  }

  async list(userId: string) {
    return this.prisma.jobAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, query: true, location: true, active: true, lastRunAt: true, lastMatchAt: true, createdAt: true },
    });
  }

  async remove(userId: string, id: string) {
    const res = await this.prisma.jobAlert.deleteMany({ where: { id, userId } });
    if (!res.count) throw new NotFoundException('Alert not found.');
    return { ok: true };
  }

  /**
   * Cron entry point: run every active alert, email new openings.
   * Never throws per-alert — one bad alert must not kill the batch.
   */
  async runAll(): Promise<{ ran: number; emailed: number; skipped: number }> {
    if (!this.liveJobs.isConfigured()) {
      this.logger.warn('Job alerts skipped: live-jobs provider not configured');
      return { ran: 0, emailed: 0, skipped: -1 };
    }
    const alerts = await this.prisma.jobAlert.findMany({
      where: { active: true },
      take: 500,
    });
    let ran = 0;
    let emailed = 0;
    let skipped = 0;
    for (const alert of alerts) {
      try {
        const sent = await this.runOne(alert);
        ran += 1;
        if (sent) emailed += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(`Alert ${alert.id} failed: ${String(err)}`);
      }
    }
    return { ran, emailed, skipped };
  }

  private async runOne(alert: {
    id: string; userId: string; query: string; location: string | null; seenKeys: unknown;
  }): Promise<boolean> {
    const openings = await this.liveJobs.search(alert.query, {
      where: alert.location || undefined,
      limit: 20,
    });
    const seen = new Set(Array.isArray(alert.seenKeys) ? (alert.seenKeys as string[]) : []);
    const fresh = openings.filter((o) => o.url && !seen.has(o.url)).slice(0, OPENINGS_PER_RUN);

    const now = new Date();
    if (!fresh.length) {
      await this.prisma.jobAlert.update({ where: { id: alert.id }, data: { lastRunAt: now } });
      return false;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: alert.userId },
      select: { email: true, fullName: true },
    });
    let sent = false;
    if (user?.email) {
      sent = await this.mail.sendJobAlertEmail({
        to: user.email,
        userName: user.fullName || '',
        query: alert.query,
        location: alert.location,
        openings: fresh.map((o) => ({
          title: o.title, company: o.company, location: o.location, url: o.url, salaryText: o.salaryText,
        })),
      });
    }

    // Record the fresh keys regardless of SMTP success so a broken mailer
    // doesn't re-queue the same jobs forever; cap the memory window.
    const nextSeen = [...fresh.map((o) => o.url), ...seen].slice(0, MAX_SEEN_KEYS);
    await this.prisma.jobAlert.update({
      where: { id: alert.id },
      data: { seenKeys: nextSeen, lastRunAt: now, lastMatchAt: now },
    });
    return sent;
  }
}
