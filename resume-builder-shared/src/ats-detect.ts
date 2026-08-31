/**
 * Identify which ATS an employer runs from a job posting URL.
 *
 * Jobscan's most-marketed feature is "this employer uses Workday, so…". We
 * already store `JobApplication.jdUrl`, and for the hosted ATS platforms the
 * product IS the hostname — no scraping, no network, no guessing. v1 is
 * detection + honest labelling only; we do NOT claim engine-specific parse
 * rules we haven't verified with the simulator.
 *
 * Aggregators (LinkedIn, Naukri, Indeed…) are flagged as such: the posting is
 * a repost and the employer's real ATS is unknown — saying so is more honest
 * than guessing.
 */

export type AtsDetection = {
  /** Stable id, e.g. 'workday' | 'greenhouse' | … | 'aggregator'. */
  ats: string;
  /** Human name for badges: "Workday", "Greenhouse"… */
  label: string;
  /** True when the URL is a job board / aggregator, not the employer's ATS. */
  aggregator: boolean;
};

type Rule = { pattern: RegExp; ats: string; label: string; aggregator?: boolean };

/**
 * Hostname (and occasionally path) patterns, checked in order. Hosted-ATS
 * platforms first — they are unambiguous; aggregators last.
 */
const RULES: Rule[] = [
  { pattern: /(^|\.)greenhouse\.io$/i, ats: 'greenhouse', label: 'Greenhouse' },
  { pattern: /(^|\.)myworkdayjobs\.com$|(^|\.)wd\d+\.myworkdaysite\.com$/i, ats: 'workday', label: 'Workday' },
  { pattern: /(^|\.)icims\.com$/i, ats: 'icims', label: 'iCIMS' },
  { pattern: /(^|\.)lever\.co$/i, ats: 'lever', label: 'Lever' },
  { pattern: /(^|\.)taleo\.net$/i, ats: 'taleo', label: 'Taleo (Oracle)' },
  { pattern: /(^|\.)smartrecruiters\.com$/i, ats: 'smartrecruiters', label: 'SmartRecruiters' },
  { pattern: /(^|\.)jobvite\.com$/i, ats: 'jobvite', label: 'Jobvite' },
  { pattern: /(^|\.)ashbyhq\.com$/i, ats: 'ashby', label: 'Ashby' },
  { pattern: /(^|\.)bamboohr\.com$/i, ats: 'bamboohr', label: 'BambooHR' },
  { pattern: /(^|\.)workable\.com$/i, ats: 'workable', label: 'Workable' },
  { pattern: /(^|\.)recruitee\.com$/i, ats: 'recruitee', label: 'Recruitee' },
  { pattern: /(^|\.)breezy\.hr$/i, ats: 'breezy', label: 'Breezy HR' },
  { pattern: /(^|\.)successfactors\.(com|eu)$/i, ats: 'successfactors', label: 'SAP SuccessFactors' },
  { pattern: /(^|\.)eightfold\.ai$/i, ats: 'eightfold', label: 'Eightfold' },
  { pattern: /(^|\.)darwinbox\.(in|com)$/i, ats: 'darwinbox', label: 'Darwinbox' },
  { pattern: /(^|\.)zohorecruit\.(com|in)$/i, ats: 'zohorecruit', label: 'Zoho Recruit' },
  { pattern: /(^|\.)keka\.com$/i, ats: 'keka', label: 'Keka' },
  // Aggregators / job boards — employer's own ATS unknown.
  { pattern: /(^|\.)linkedin\.com$/i, ats: 'aggregator', label: 'LinkedIn (job board)', aggregator: true },
  { pattern: /(^|\.)naukri\.com$/i, ats: 'aggregator', label: 'Naukri (job board)', aggregator: true },
  { pattern: /(^|\.)indeed\.(com|co\.in)$/i, ats: 'aggregator', label: 'Indeed (job board)', aggregator: true },
  { pattern: /(^|\.)glassdoor\.(com|co\.in)$/i, ats: 'aggregator', label: 'Glassdoor (job board)', aggregator: true },
  { pattern: /(^|\.)foundit\.in$|(^|\.)monster(india)?\.com$/i, ats: 'aggregator', label: 'Foundit/Monster (job board)', aggregator: true },
  { pattern: /(^|\.)instahyre\.com$/i, ats: 'aggregator', label: 'Instahyre (job board)', aggregator: true },
  { pattern: /(^|\.)wellfound\.com$|(^|\.)angel\.co$/i, ats: 'aggregator', label: 'Wellfound (job board)', aggregator: true },
];

/** Detect the ATS behind a job URL; null when unknown or the URL is invalid. */
export function detectAtsFromUrl(url?: string | null): AtsDetection | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let hostname = '';
  try {
    hostname = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  if (!hostname) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(hostname)) {
      return { ats: rule.ats, label: rule.label, aggregator: Boolean(rule.aggregator) };
    }
  }
  return null;
}
