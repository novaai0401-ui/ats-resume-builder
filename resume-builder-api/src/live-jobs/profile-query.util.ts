/**
 * Turn a saved resume into a job-search query.
 *
 * Pure and dependency-free so it unit-tests without a database or network.
 *
 * The goal is "jobs related to my profile" without asking the user to type
 * anything. What actually drives relevance in a keyword job API is the ROLE —
 * aggregators match titles far more strongly than skill lists — so the role
 * leads and a small number of skills disambiguate it. Sending the whole skill
 * list makes results worse, not better: these APIs AND the terms, so a
 * fifteen-skill query matches almost nothing.
 */

/** How many skills to append. Enough to disambiguate, few enough to still match. */
const MAX_SKILLS = 3;

/** Words that make a title worse as a search term. */
const NOISE = new Set([
  'resume',
  'cv',
  'profile',
  'copy',
  'draft',
  'final',
  'updated',
  'new',
  'latest',
  'v1',
  'v2',
  'v3',
]);

export interface ProfileQuery {
  /** Keyword string to send to the provider. */
  query: string;
  /** Location filter, or undefined to fall back to the provider default. */
  where?: string;
  /** True when we found nothing usable — caller should not search. */
  empty: boolean;
  /**
   * Progressively broader queries to try when the one above returns nothing,
   * most specific first.
   *
   * Job APIs AND their keywords, so a precise query fails closed: a real resume
   * produced "AVP HTML5 CSS3 JavaScript" and matched zero openings in a city
   * where "Senior Frontend Engineer React" matches dozens. One query with no
   * fallback means the feature silently reports "no jobs" when the truth is
   * "that phrasing was too narrow".
   */
  fallbacks: string[];
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/[|/(),]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a resume title to something a job board can match.
 *
 * Strips the bookkeeping people add ("Tech Lead Resume v2"), keeps only the
 * FIRST slash-separated segment, and caps the length.
 *
 * The cap is the important part. A real title —
 * "Assistant Vice President - Engineering / Frontend Platforms / Engineering
 * Leadership" — is a headline, not a search term. Passed through whole it
 * becomes a seven-word ANDed query that matches nothing anywhere. The first
 * segment is the actual role; the rest is scope.
 */
const MAX_TITLE_WORDS = 4;

function cleanTitle(value: unknown): string {
  // Slash-separated segments are alternatives/scope; the first is the role.
  const firstSegment = String(value ?? '').split('/')[0] ?? '';
  return clean(firstSegment)
    // A dangling separator survives clean() and would be searched literally.
    .replace(/[-–—]+/g, ' ')
    .split(' ')
    .filter((word) => word && !NOISE.has(word.toLowerCase()))
    .slice(0, MAX_TITLE_WORDS)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A city, not a full address. Resume contact lines are commonly
 * "Pune, MH 411057" or "Bengaluru, India"; the leading segment is the part a
 * job API can match, and sending the postcode returns nothing.
 */
function cityFrom(location: unknown): string {
  // Split on the comma BEFORE cleaning: clean() strips commas, so cleaning
  // first would leave "Pune, MH 411057" as one segment and yield "Pune MH".
  const first = String(location ?? '').split(',')[0] ?? '';
  // Drop a trailing postcode when the whole value was a single segment.
  return clean(first).replace(/\s*\b\d{4,}\b\s*$/, '').trim();
}

/**
 * Is this job title too terse to search on?
 *
 * Internal abbreviations — AVP, SDE, VP, PM, SME — are how people write their
 * own title, but job boards index the spelled-out form. Searching "AVP" returns
 * nothing while "Assistant Vice President Engineering" returns plenty, so when
 * the role looks like an acronym the descriptive document title is the better
 * lead even though it is user-authored.
 */
function isTerseRole(role: string): boolean {
  if (!role) return true;
  const words = role.split(' ').filter(Boolean);
  if (words.length > 1) return false;
  // A lone word that is short or all-caps reads as an abbreviation.
  return words[0].length <= 4 || words[0] === words[0].toUpperCase();
}

/**
 * Build the search from a resume, plus a ladder of broader retries.
 *
 * Role precedence: normally the most recent job title beats the document title,
 * because the document title is user-authored and often aspirational or
 * administrative. The exception is a terse role — see isTerseRole — where the
 * document title carries the words a job board actually indexes.
 */
export function buildProfileJobQuery(resume: unknown): ProfileQuery {
  const r = (resume ?? {}) as Record<string, unknown>;

  const experience = Array.isArray(r.experience) ? (r.experience as Record<string, unknown>[]) : [];
  const latestRole = cleanTitle(experience[0]?.role);
  const docTitle = cleanTitle(r.title);
  // Prefer the descriptive source when the role alone would not match.
  const role =
    isTerseRole(latestRole) && docTitle && !isTerseRole(docTitle) ? docTitle : latestRole || docTitle;

  const skillPool = [
    ...(Array.isArray(r.technicalSkills) ? (r.technicalSkills as unknown[]) : []),
    ...(Array.isArray(r.skills) ? (r.skills as unknown[]) : []),
  ]
    .map(clean)
    .filter(Boolean);

  // De-duplicate case-insensitively, keeping the first spelling.
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const skill of skillPool) {
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // A skill already inside the role adds nothing to the query.
    if (role && role.toLowerCase().includes(key)) continue;
    skills.push(skill);
    if (skills.length >= MAX_SKILLS) break;
  }

  const terms = [role, ...skills].filter(Boolean);
  const contact = (r.contact ?? {}) as Record<string, unknown>;
  const where = cityFrom(contact.location) || undefined;

  // Ladder from most specific to broadest. Each rung drops a constraint, so a
  // narrow phrasing degrades to a useful search instead of an empty panel.
  const ladder = [
    terms.join(' '),
    // Role with fewer skills, then the role by itself.
    [role, ...skills.slice(0, 1)].filter(Boolean).join(' '),
    role,
    // The other title source, in case the one we led with is the poor one.
    role === docTitle ? latestRole : docTitle,
    // Last resort: the skills alone still describe the kind of work.
    skills.slice(0, 2).join(' '),
  ];

  const seenQ = new Set<string>();
  const fallbacks: string[] = [];
  for (const candidate of ladder) {
    const value = (candidate || '').trim();
    if (!value || seenQ.has(value.toLowerCase())) continue;
    seenQ.add(value.toLowerCase());
    fallbacks.push(value);
  }

  return {
    // fallbacks[0] is the primary; keep `query` as the same value so existing
    // callers that only read `query` behave exactly as before.
    query: fallbacks[0] ?? '',
    where,
    empty: fallbacks.length === 0,
    fallbacks: fallbacks.slice(1),
  };
}
