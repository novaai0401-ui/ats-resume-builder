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
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/[|/(),]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip the bookkeeping people put in resume titles ("Tech Lead Resume v2")
 * so it does not leak into the search terms.
 */
function cleanTitle(value: unknown): string {
  return clean(value)
    .split(' ')
    .filter((word) => word && !NOISE.has(word.toLowerCase()))
    .join(' ')
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
 * Build the search from a resume.
 *
 * Role precedence: the most recent job title beats the document title, because
 * the document title is user-authored and often aspirational or administrative,
 * while the experience entry is what they have actually done. Falls back to the
 * document title, then to skills alone.
 */
export function buildProfileJobQuery(resume: unknown): ProfileQuery {
  const r = (resume ?? {}) as Record<string, unknown>;

  const experience = Array.isArray(r.experience) ? (r.experience as Record<string, unknown>[]) : [];
  const latestRole = cleanTitle(experience[0]?.role);
  const docTitle = cleanTitle(r.title);
  const role = latestRole || docTitle;

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

  return {
    query: terms.join(' '),
    where,
    empty: terms.length === 0,
  };
}
