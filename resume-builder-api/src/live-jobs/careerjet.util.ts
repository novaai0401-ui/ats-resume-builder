/**
 * Pure helpers for the Careerjet jobs provider — URL construction and response
 * normalization. Dependency-free so they unit-test without network access,
 * matching the Adzuna provider next door.
 *
 * WHY CAREERJET RATHER THAN NAUKRI OR INDEED DIRECTLY
 * ---------------------------------------------------
 * Neither can be integrated directly. Indeed closed its Publisher (job search)
 * API to new partners — what remains is employer/ATS-side only — and Naukri
 * (Info Edge) has never published a seeker-side search API; theirs are
 * recruiter APIs under commercial agreement. Scraping either breaches their
 * terms. Careerjet is a licensed aggregator with strong Indian coverage that
 * indexes listings syndicated from those boards, so it reaches that inventory
 * through a route we are actually allowed to use.
 *
 * Free to use with an affiliate id from https://www.careerjet.com/partners/
 *
 * API quirk worth knowing: `affid`, `user_ip` and `user_agent` are all
 * MANDATORY. Omitting the last two returns an error payload rather than
 * results, which is easy to misread as "no jobs found".
 */

import type { JobOpening, JobSearchOptions } from './adzuna.util';

export interface CareerjetConfig {
  /** 20-character affiliate id from careerjet.com/partners. */
  affid: string;
  /** Careerjet locale, e.g. 'en_IN', 'en_US', 'en_GB'. */
  localeCode: string;
  /**
   * Careerjet attributes the call to an end user, so it wants the caller's IP
   * and UA. We are server-side, so these are the server's — that is expected
   * for a backend integration and Careerjet documents it.
   */
  userIp: string;
  userAgent: string;
}

const CAREERJET_BASE = 'http://public.api.careerjet.net/search';
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/** Build the Careerjet search URL for a query. Page is fixed to 1. */
export function buildCareerjetUrl(
  cfg: CareerjetConfig,
  query: string,
  opts: JobSearchOptions = {},
): string {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const params = new URLSearchParams({
    affid: cfg.affid,
    keywords: query.trim(),
    locale_code: cfg.localeCode || 'en_IN',
    pagesize: String(limit),
    page: '1',
    sort: 'date',
    user_ip: cfg.userIp,
    user_agent: cfg.userAgent,
  });
  if (opts.where && opts.where.trim()) params.set('location', opts.where.trim());
  return `${CAREERJET_BASE}?${params.toString()}`;
}

/** Strip the HTML Careerjet embeds in titles and company names. */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Careerjet returns `date` as "YYYY-MM-DD HH:MM:SS" (not ISO). Convert to the
 * ISO string the rest of the app expects, and drop anything unparseable rather
 * than emitting an Invalid Date that would render as "NaN" in the UI.
 */
function toIsoDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Normalize a raw Careerjet API payload into our JobOpening shape. */
export function normalizeCareerjetResults(payload: unknown, limit = DEFAULT_LIMIT): JobOpening[] {
  const body = payload as { type?: string; jobs?: unknown };
  // Careerjet signals failure with type !== 'JOBS' rather than an HTTP error.
  if (body?.type && body.type !== 'JOBS') return [];
  if (!Array.isArray(body?.jobs)) return [];

  const out: JobOpening[] = [];
  for (const raw of body.jobs) {
    const r = raw as Record<string, unknown>;
    const title = clean(r?.title);
    const url = String(r?.url ?? '').trim();
    if (!title || !url) continue;
    out.push({
      title,
      company: clean(r?.company) || 'Unknown',
      location: clean(r?.locations),
      // Careerjet gives salary as pre-formatted display text, not min/max
      // numbers, so pass it through rather than re-deriving a range.
      salaryText: clean(r?.salary) || null,
      postedAt: toIsoDate(r?.date),
      url,
      source: 'careerjet',
    });
    if (out.length >= limit) break;
  }
  return out;
}
