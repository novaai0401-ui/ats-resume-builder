import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { LiveJobsService } from '../live-jobs/live-jobs.service';

/**
 * R-087 — live-jobs (Adzuna) diagnostics. The job feed ships
 * configured-optional: without ADZUNA_APP_ID/APP_KEY the panel says
 * "not configured" and job alerts no-op. This admin surface mirrors
 * admin/mail/status + admin/ai/status so ops can see, in one call,
 * whether the feed is enabled AND whether a live probe actually
 * returns openings — without shelling into Render. No secrets.
 */
@SkipThrottle()
@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class JobsStatusController {
  constructor(
    private readonly liveJobs: LiveJobsService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async status() {
    const configured = this.liveJobs.isConfigured();
    const country = this.config.get<string>('ADZUNA_COUNTRY', 'in');
    const defaultLocation = this.liveJobs.defaultLocation() || null;

    let probeOk = false;
    let probeCount = 0;
    if (configured) {
      // Live probe with a query that matches something in any market.
      // search() never throws — [] doubles as "reachable but empty/failed",
      // which the hint disambiguates well enough for ops.
      const openings = await this.liveJobs.search('software engineer', { limit: 1 });
      probeOk = openings.length > 0;
      probeCount = openings.length;
    }

    return {
      provider: 'adzuna',
      configured,
      country,
      defaultLocation,
      probeOk,
      probeCount,
      hint: buildHint(configured, probeOk),
    };
  }
}

function buildHint(configured: boolean, probeOk: boolean): string {
  if (!configured) {
    return 'Live jobs are OFF. Register free at developer.adzuna.com, then set ADZUNA_APP_ID and ADZUNA_APP_KEY in the environment (optional: ADZUNA_COUNTRY, default "in", and ADZUNA_DEFAULT_LOCATION). The jobs panel and email job alerts enable themselves once both are set.';
  }
  if (!probeOk) {
    return 'Adzuna keys are set but a live search returned nothing — check the keys are active on developer.adzuna.com (new keys can take a few minutes) and that ADZUNA_COUNTRY matches your market.';
  }
  return 'Live jobs are ON — Adzuna responded with openings. The /jobs panel and job-alert emails are active.';
}
