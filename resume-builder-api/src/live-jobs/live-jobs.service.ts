import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildAdzunaUrl,
  normalizeAdzunaResults,
  type AdzunaConfig,
  type JobOpening,
  type JobSearchOptions,
} from './adzuna.util';
import {
  buildCareerjetUrl,
  careerjetHeaders,
  isCareerjetAuthError,
  normalizeCareerjetResults,
  type CareerjetConfig,
} from './careerjet.util';

/**
 * Live job-openings feed, aggregated across providers.
 *
 * Designed never to break the caller: an unconfigured or failing provider
 * contributes nothing rather than throwing, so features (the Skill-Demand
 * Agent, job-alert emails) degrade to curated data instead of erroring. That
 * also means adding a provider cannot regress the existing one — each is
 * awaited independently and a rejection is contained.
 *
 * On Naukri and Indeed: neither can be called directly. Indeed closed its
 * Publisher search API to new partners, and Naukri has never offered a
 * seeker-side one, so both are reached — where their listings are syndicated —
 * through Careerjet, a licensed aggregator. See careerjet.util.ts.
 */
@Injectable()
export class LiveJobsService {
  private readonly logger = new Logger(LiveJobsService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when at least one provider is configured. */
  isConfigured(): boolean {
    return Boolean(this.adzunaCfg() || this.careerjetCfg());
  }

  /** Which providers are live — used by the admin diagnostics panel. */
  configuredSources(): string[] {
    const sources: string[] = [];
    if (this.adzunaCfg()) sources.push('adzuna');
    if (this.careerjetCfg()) sources.push('careerjet');
    return sources;
  }

  private adzunaCfg(): AdzunaConfig | null {
    const appId = this.config.get<string>('ADZUNA_APP_ID', '');
    const appKey = this.config.get<string>('ADZUNA_APP_KEY', '');
    if (!appId || !appKey) return null;
    return { appId, appKey, country: this.config.get<string>('ADZUNA_COUNTRY', 'in') };
  }

  private careerjetCfg(): CareerjetConfig | null {
    // CAREERJET_AFFID is still accepted so an environment set up against the
    // legacy naming keeps working; v4 calls it an API key.
    const apiKey =
      this.config.get<string>('CAREERJET_API_KEY', '') ||
      this.config.get<string>('CAREERJET_AFFID', '');
    if (!apiKey) return null;
    return {
      apiKey,
      localeCode: this.config.get<string>('CAREERJET_LOCALE', 'en_IN'),
      // Careerjet requires both of these on every call. We are server-side, so
      // they describe the server; that is what their backend integrations do.
      userIp: this.config.get<string>('CAREERJET_USER_IP', '127.0.0.1'),
      userAgent: this.config.get<string>('CAREERJET_USER_AGENT', 'CallbackCV/1.0'),
      // v4 rejects a request with no Referer, so this needs a real default
      // rather than an empty string.
      referer: this.config.get<string>(
        'CAREERJET_REFERER',
        'https://callbackcv.tekivex.com/jobs',
      ),
    };
  }

  /** Default location applied when the caller doesn't specify one. */
  defaultLocation(): string {
    return this.config.get<string>('ADZUNA_DEFAULT_LOCATION', '');
  }

  private timeoutMs(): number {
    const parsed = parseInt(this.config.get<string>('LIVE_JOBS_TIMEOUT_MS', '8000'), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
  }

  /** GET a provider URL with a timeout, returning null on any failure. */
  private async fetchJson(
    url: string,
    label: string,
    query: string,
    headers?: Record<string, string>,
  ): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        // Careerjet returns its reason in the BODY of a 403 ("Undeclared
        // referrer", "Unauthorized access from IP x.x.x.x"). Logging only the
        // status would leave an operator guessing at what is an account
        // setting, not a code fault, so read the body before giving up.
        let detail = '';
        try {
          const reason = isCareerjetAuthError(await res.clone().json());
          if (reason) detail = ` — ${reason}`;
        } catch {
          /* body was not JSON; the status alone will have to do */
        }
        this.logger.warn(`${label} search ${res.status} for "${query}"${detail}`);
        return null;
      }
      return await res.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`${label} search failed for "${query}": ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The same opening often appears in more than one feed. Key on company +
   * title + location rather than URL, because each aggregator rewrites the URL
   * through its own redirect, so identical roles never share one.
   */
  private static dedupe(openings: JobOpening[], limit: number): JobOpening[] {
    const seen = new Set<string>();
    const out: JobOpening[] = [];
    for (const job of openings) {
      const key = `${job.company}|${job.title}|${job.location}`.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(job);
      if (out.length >= limit) break;
    }
    return out;
  }

  async search(query: string, opts: JobSearchOptions = {}): Promise<JobOpening[]> {
    if (!query.trim()) return [];
    const where = opts.where ?? (this.defaultLocation() || undefined);
    const limit = opts.limit ?? 8;

    const adzuna = this.adzunaCfg();
    const careerjet = this.careerjetCfg();
    if (!adzuna && !careerjet) return [];

    // Ask each provider for the full limit: after dedupe the combined list
    // would otherwise come back short whenever the feeds overlap.
    const perProvider = { ...opts, where, limit };

    const tasks: Array<Promise<JobOpening[]>> = [];
    if (adzuna) {
      tasks.push(
        this.fetchJson(buildAdzunaUrl(adzuna, query, perProvider), 'Adzuna', query).then((p) =>
          p ? normalizeAdzunaResults(p, limit) : [],
        ),
      );
    }
    if (careerjet) {
      tasks.push(
        this.fetchJson(
          buildCareerjetUrl(careerjet, query, perProvider),
          'Careerjet',
          query,
          careerjetHeaders(careerjet),
        ).then((p) => {
          // v4 can answer 200 with an error body, so an auth failure would
          // otherwise look identical to a quiet day.
          const authError = isCareerjetAuthError(p);
          if (authError) {
            this.logger.warn(`Careerjet rejected the call: ${authError}`);
            return [];
          }
          return p ? normalizeCareerjetResults(p, limit) : [];
        }),
      );
    }

    // allSettled, not all: one provider being down must not blank the feed.
    const settled = await Promise.allSettled(tasks);
    const merged = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

    // Newest first across providers, then dedupe. Undated listings sort last
    // rather than jumping the queue.
    merged.sort((a, b) => {
      const at = a.postedAt ? Date.parse(a.postedAt) : 0;
      const bt = b.postedAt ? Date.parse(b.postedAt) : 0;
      return bt - at;
    });
    return LiveJobsService.dedupe(merged, limit);
  }
}
