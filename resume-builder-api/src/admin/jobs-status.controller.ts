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
    const sources = this.liveJobs.configuredSources();
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

    // The two Render cron services (nudges / job alerts) authenticate with
    // CRON_SECRET. Report whether the API side has it, so a "Failed run"
    // on the cron can be diagnosed in one call: false here → set it on
    // ats-rb-api; true here but cron still 403s → the cron service's copy
    // doesn't match.
    const cronSecretConfigured = Boolean(String(process.env.CRON_SECRET || '').trim());

    return {
      // Was the literal 'adzuna'. The feed is multi-provider now, so report
      // which ones are actually live — otherwise ops cannot tell whether a
      // thin result set means one provider is unset or both are failing.
      provider: sources.join('+') || 'none',
      sources,
      configured,
      country,
      defaultLocation,
      probeOk,
      probeCount,
      cronSecretConfigured,
      hint: buildHint(configured, probeOk, cronSecretConfigured, sources),
    };
  }
}

function buildHint(
  configured: boolean,
  probeOk: boolean,
  cronSecretConfigured?: boolean,
  sources: string[] = [],
): string {
  if (!cronSecretConfigured) {
    return 'CRON_SECRET is NOT set on the API — the daily nudge and job-alert crons will get 403 and show "Failed run" on Render. Set the same CRON_SECRET value on ats-rb-api AND both cron services (ats-rb-cron-nudges, ats-rb-cron-job-alerts), then use each cron\'s "Trigger Run" button to verify.';
  }
  if (!configured) {
    return 'Live jobs are OFF — no provider is configured. Either works on its own: Adzuna (register free at developer.adzuna.com, set ADZUNA_APP_ID + ADZUNA_APP_KEY) or Careerjet (free affiliate id at careerjet.com/partners, set CAREERJET_AFFID). Careerjet is the one that carries Naukri- and Indeed-syndicated listings, since neither offers a direct API. The jobs panel and job-alert emails enable themselves once at least one is set.';
  }
  if (!probeOk) {
    return `Configured (${sources.join(', ')}) but a live search returned nothing. For Adzuna, check the keys are active on developer.adzuna.com (new keys take a few minutes) and that ADZUNA_COUNTRY matches your market. For Careerjet, check CAREERJET_AFFID is the 20-character affiliate id and that CAREERJET_LOCALE matches your market (default en_IN).`;
  }
  const only = sources.length === 1 ? ` Only ${sources[0]} is configured — adding the other widens coverage.` : '';
  return `Live jobs are ON — ${sources.join(' + ')} responded with openings. The /jobs panel and job-alert emails are active.${only}`;
}
