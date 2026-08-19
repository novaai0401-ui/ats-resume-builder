/**
 * Pure helpers for the Careerjet jobs provider — URL, headers and response
 * normalization. Dependency-free so they unit-test without network access,
 * matching the Adzuna provider next door.
 *
 * WHY CAREERJET RATHER THAN NAUKRI OR INDEED DIRECTLY
 * ---------------------------------------------------
 * Neither can be integrated. Indeed closed its Publisher (job search) API to
 * new partners — what remains is employer/ATS-side only — and Naukri (Info
 * Edge) has never published a seeker-side search API; theirs are recruiter APIs
 * under commercial agreement. Scraping either breaches their terms. Careerjet
 * is a licensed aggregator with strong Indian coverage, reachable by a route we
 * are actually allowed to use.
 *
 * THIS IS THE v4 API, NOT THE LEGACY ONE
 * --------------------------------------
 * The legacy endpoint (public.api.careerjet.net/search, affiliate id passed as
 * an `affid` query parameter) is dead for new accounts: it answers 403
 * "Undeclared referrer". v4 differs in every part of the call —
 *
 *   host    search.api.careerjet.net, over HTTPS
 *   path    /v4/query
 *   auth    HTTP Basic, username = API key, EMPTY password (note the colon)
 *   header  Referer is REQUIRED; without it the request is rejected
 *
 * Careerjet also authorises by source IP, so the calling server's address must
 * be registered on the account. An unregistered one gets 403 "Unauthorized
 * access from IP x.x.x.x" — which is an account setting, not a code fault, and
 * is why isCareerjetAuthError() distinguishes the two.
 *
 * Keys: https://www.careerjet.com/partners/
 */

import type { JobOpening, JobSearchOptions } from './adzuna.util';

export interface CareerjetConfig {
  /** API key from the partner dashboard, sent as the Basic auth username. */
  apiKey: string;
  /** Careerjet locale, e.g. 'en_IN', 'en_US', 'en_GB'. */
  localeCode: string;
  /**
   * Careerjet attributes each call to an end user and wants their IP and UA.
   * We call server-side, so these describe the server — expected for a backend
   * integration.
   */
  userIp: string;
  userAgent: string;
  /** Required by v4. The page the search is presented on. */
  referer: string;
}

const CAREERJET_V4_URL = 'https://search.api.careerjet.net/v4/query';
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/** Build the v4 search URL. Page is fixed to 1. */
export function buildCareerjetUrl(
  cfg: CareerjetConfig,
  query: string,
  opts: JobSearchOptions = {},
): string {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const params = new URLSearchParams({
    keywords: query.trim(),
    locale_code: cfg.localeCode || 'en_IN',
    pagesize: String(limit),
    page: '1',
    sort: 'date',
    user_ip: cfg.userIp,
    user_agent: cfg.userAgent,
  });
  if (opts.where && opts.where.trim()) params.set('location', opts.where.trim());
  return `${CAREERJET_V4_URL}?${params.toString()}`;
}

/**
 * Headers for a v4 call.
 *
 * The API key goes in Basic auth as the USERNAME with an empty password, so the
 * encoded pair ends in a colon. Putting the key in a query parameter — as the
 * legacy API did — is rejected.
 */
export function careerjetHeaders(cfg: CareerjetConfig): Record<string, string> {
  const basic = Buffer.from(`${cfg.apiKey}:`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
    // Required. Omitting it returns 403 "Undeclared referrer".
    Referer: cfg.referer,
  };
}

/**
 * True when a payload is Careerjet refusing the CALLER rather than finding
 * nothing. Worth separating: an empty result is normal and silent, whereas an
 * auth failure needs an operator to register an IP or fix a key, and would
 * otherwise be indistinguishable from "no jobs today".
 */
export function isCareerjetAuthError(payload: unknown): string | null {
  const body = payload as { type?: string; error?: string };
  if (body?.type === 'ERROR' && typeof body.error === 'string') return body.error;
  return null;
}

/** Strip the HTML Careerjet embeds in titles and company names. */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Careerjet returns `date` as "YYYY-MM-DD HH:MM:SS" (not ISO). Convert to the
 * ISO string the rest of the app expects, and drop anything unparseable rather
 * than emitting an Invalid Date that renders as "NaN" in the UI.
 */
function toIsoDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Normalize a raw Careerjet payload into our JobOpening shape.
 *
 * Reads the `jobs` array, falling back to the first array of job-shaped objects
 * if a future response nests or renames it. That tolerance is deliberate: the
 * success shape could not be confirmed against the live API while the calling
 * IP was unauthorised, so this fails soft to [] rather than throwing on a shape
 * that turns out to differ.
 */
export function normalizeCareerjetResults(payload: unknown, limit = DEFAULT_LIMIT): JobOpening[] {
  if (isCareerjetAuthError(payload)) return [];
  const body = (payload ?? {}) as Record<string, unknown>;

  let rows: unknown[] | null = Array.isArray(body.jobs) ? (body.jobs as unknown[]) : null;
  if (!rows) {
    for (const value of Object.values(body)) {
      if (
        Array.isArray(value) &&
        value.some((v) => v && typeof v === 'object' && 'title' in (v as object))
      ) {
        rows = value as unknown[];
        break;
      }
    }
  }
  if (!rows) return [];

  const out: JobOpening[] = [];
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = clean(r.title);
    const url = String(r.url ?? '').trim();
    if (!title || !url) continue;
    out.push({
      title,
      company: clean(r.company) || 'Unknown',
      location: clean(r.locations ?? r.location),
      // Careerjet gives salary as pre-formatted display text, not min/max
      // numbers, so pass it through rather than re-deriving a range.
      salaryText: clean(r.salary) || null,
      postedAt: toIsoDate(r.date),
      url,
      source: 'careerjet',
    });
    if (out.length >= limit) break;
  }
  return out;
}
