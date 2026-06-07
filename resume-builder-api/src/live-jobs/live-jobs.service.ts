import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildAdzunaUrl,
  normalizeAdzunaResults,
  type AdzunaConfig,
  type JobOpening,
  type JobSearchOptions,
} from './adzuna.util';

/**
 * Live job-openings feed. Today backed by Adzuna; the provider is resolved from
 * config so a different source can be swapped in without touching callers.
 *
 * Designed to never break the caller: if it's not configured or the upstream
 * fails, `search` returns [] and `isConfigured()` reports false, so features
 * (e.g. the Skill-Demand Agent) gracefully fall back to curated data.
 */
@Injectable()
export class LiveJobsService {
  private readonly logger = new Logger(LiveJobsService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ADZUNA_APP_ID', '') && this.config.get<string>('ADZUNA_APP_KEY', ''),
    );
  }

  private cfg(): AdzunaConfig | null {
    const appId = this.config.get<string>('ADZUNA_APP_ID', '');
    const appKey = this.config.get<string>('ADZUNA_APP_KEY', '');
    if (!appId || !appKey) return null;
    return { appId, appKey, country: this.config.get<string>('ADZUNA_COUNTRY', 'in') };
  }

  /** Default location applied when the caller doesn't specify one. */
  defaultLocation(): string {
    return this.config.get<string>('ADZUNA_DEFAULT_LOCATION', '');
  }

  async search(query: string, opts: JobSearchOptions = {}): Promise<JobOpening[]> {
    const cfg = this.cfg();
    if (!cfg || !query.trim()) return [];
    const where = opts.where ?? (this.defaultLocation() || undefined);
    const url = buildAdzunaUrl(cfg, query, { ...opts, where });
    try {
      const timeoutMs = parseInt(this.config.get<string>('LIVE_JOBS_TIMEOUT_MS', '8000'), 10);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let payload: unknown;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          this.logger.warn(`Adzuna search ${res.status} for "${query}"`);
          return [];
        }
        payload = await res.json();
      } finally {
        clearTimeout(timer);
      }
      return normalizeAdzunaResults(payload, opts.limit ?? 8);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Live jobs search failed for "${query}": ${msg}`);
      return [];
    }
  }
}
