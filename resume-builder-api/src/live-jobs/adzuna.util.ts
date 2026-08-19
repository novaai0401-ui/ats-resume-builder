/**
 * Pure helpers for the Adzuna jobs provider — URL construction and response
 * normalization. Kept dependency-free so they unit-test without network access.
 *
 * Adzuna gives real, country-specific listings (including India) on a free
 * tier with an app id + key. Docs: https://developer.adzuna.com/
 */

/** Providers that can produce a JobOpening. Widen this when adding one. */
export type JobSource = 'adzuna' | 'careerjet';

export interface JobOpening {
  title: string;
  company: string;
  location: string;
  url: string;
  salaryText: string | null;
  postedAt: string | null; // ISO date or null
  /** Which feed this came from — surfaced in the UI so users can judge freshness. */
  source: JobSource;
}

export interface AdzunaConfig {
  appId: string;
  appKey: string;
  /** ISO country code Adzuna supports: 'in', 'us', 'gb', etc. */
  country: string;
}

export interface JobSearchOptions {
  /** Free-text location filter (e.g. "Bengaluru"). */
  where?: string;
  /** Max results to request (Adzuna caps at 50/page). */
  limit?: number;
}

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs';
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/** Build the Adzuna search URL for a query. Page is fixed to 1. */
export function buildAdzunaUrl(cfg: AdzunaConfig, query: string, opts: JobSearchOptions = {}): string {
  const country = (cfg.country || 'in').toLowerCase();
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: String(limit),
    what: query.trim(),
    content_type: 'application/json',
    sort_by: 'date',
  });
  if (opts.where && opts.where.trim()) params.set('where', opts.where.trim());
  return `${ADZUNA_BASE}/${country}/search/1?${params.toString()}`;
}

function formatSalary(min?: number | null, max?: number | null, currency = '₹'): string | null {
  const lo = typeof min === 'number' && min > 0 ? min : null;
  const hi = typeof max === 'number' && max > 0 ? max : null;
  if (!lo && !hi) return null;
  const fmt = (n: number) => {
    if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)} Cr`;
    if (n >= 100_000) return `${(n / 100_000).toFixed(1)} L`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(Math.round(n));
  };
  if (lo && hi) return `${currency}${fmt(lo)}–${fmt(hi)}`;
  return `${currency}${fmt((lo || hi)!)}`;
}

/** Normalize a raw Adzuna API payload into our JobOpening shape. */
export function normalizeAdzunaResults(payload: unknown, limit = DEFAULT_LIMIT): JobOpening[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: JobOpening[] = [];
  for (const raw of results) {
    const r = raw as Record<string, unknown>;
    const title = String(r?.title ?? '').replace(/<\/?[^>]+>/g, '').trim();
    const url = String(r?.redirect_url ?? '').trim();
    if (!title || !url) continue;
    out.push({
      title,
      company: String((r?.company as { display_name?: string })?.display_name ?? '').trim() || 'Unknown',
      location: String((r?.location as { display_name?: string })?.display_name ?? '').trim(),
      url,
      salaryText: formatSalary(r?.salary_min as number, r?.salary_max as number),
      postedAt: typeof r?.created === 'string' ? r.created : null,
      source: 'adzuna',
    });
    if (out.length >= limit) break;
  }
  return out;
}
