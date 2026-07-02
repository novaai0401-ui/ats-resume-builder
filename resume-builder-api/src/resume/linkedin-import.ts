/**
 * LinkedIn profile paste → parser-friendly resume text (ADDITIVE).
 *
 * Users copy their LinkedIn profile page (Ctrl+A / share > copy) and paste
 * it into the "Import from LinkedIn" box. That text has a well-known but
 * parser-hostile shape:
 *
 *   - Visually-hidden duplicates: every heading/entity renders twice, so
 *     the paste contains "ExperienceExperience", "Software EngineerSoftware
 *     Engineer", "Tata Consultancy ServicesTata Consultancy Services".
 *   - Employment-type tails: "Acme Corp · Full-time".
 *   - Duration tails: "Jan 2020 - Present · 3 yrs 6 mos".
 *   - LinkedIn section names: About / Experience / Education /
 *     Licenses & certifications / Skills / Projects.
 *
 * normalizeLinkedInProfileText() rewrites that into the canonical shape the
 * existing parser already extracts (SECTION headings, Role / Company /
 * "(Date range)" lines). looksLikeLinkedInProfile() is the guard — anything
 * that doesn't look like a LinkedIn paste passes through untouched, so the
 * existing upload formats are unaffected.
 */

const EMPLOYMENT_TYPES = /\s*·\s*(full[- ]?time|part[- ]?time|contract|internship|freelance|self[- ]?employed|apprenticeship|seasonal|temporary)\b/gi;
const DURATION_TAIL = /\s*·\s*\d+\s*(?:yrs?|years?)(?:\s*\d+\s*(?:mos?|months?))?\s*$|\s*·\s*\d+\s*(?:mos?|months?)\s*$/i;
const LINKEDIN_DATE_LINE = /^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—]\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}|present)(\s*·.*)?$/i;

/** LinkedIn's visually-hidden duplication: "TextText" → "Text". */
export function dedupeDoubledLine(line: string): string {
  const t = line.trim();
  if (t.length < 4 || t.length % 2 !== 0) return t;
  const half = t.length / 2;
  const a = t.slice(0, half);
  const b = t.slice(half);
  return a === b ? a : t;
}

const LINKEDIN_SECTION_MAP: Array<[RegExp, string]> = [
  [/^about$/i, 'SUMMARY'],
  [/^experience$/i, 'WORK EXPERIENCE'],
  [/^education$/i, 'EDUCATION'],
  [/^licenses?\s*&?\s*certifications?$/i, 'CERTIFICATIONS'],
  [/^skills$/i, 'SKILLS'],
  [/^projects$/i, 'PROJECTS'],
  [/^honors?\s*&?\s*awards?$/i, 'ACHIEVEMENTS'],
  [/^languages$/i, 'LANGUAGES'],
  [/^publications$/i, 'PUBLICATIONS'],
  [/^volunteering$/i, 'VOLUNTEERING'],
];

/** Heuristic guard: does this paste look like a LinkedIn profile page? */
export function looksLikeLinkedInProfile(text: string): boolean {
  const t = String(text || '');
  if (/linkedin\.com\/in\//i.test(t)) return true;
  if (EMPLOYMENT_TYPES.test(t)) {
    EMPLOYMENT_TYPES.lastIndex = 0;
    return true;
  }
  EMPLOYMENT_TYPES.lastIndex = 0;
  // 3+ doubled lines is the visually-hidden-duplicate signature.
  const lines = t.split('\n').map((l) => l.trim()).filter((l) => l.length >= 6);
  let doubled = 0;
  for (const l of lines) {
    if (dedupeDoubledLine(l) !== l) doubled += 1;
    if (doubled >= 3) return true;
  }
  return false;
}

/** Rewrite a LinkedIn paste into parser-friendly resume text. */
export function normalizeLinkedInProfileText(text: string): string {
  const out: string[] = [];
  const rawLines = String(text || '').split('\n');
  for (const raw of rawLines) {
    let line = dedupeDoubledLine(raw.trim());
    if (!line) continue;
    // Drop LinkedIn chrome that never belongs on a resume.
    if (/^(see more|see all|show all \d*|connect|message|follow|more|contact info|\d+\+?\s*(followers|connections))/i.test(line)) continue;
    if (/^(home|my network|jobs|messaging|notifications)$/i.test(line)) continue;

    // Section heading?
    const section = LINKEDIN_SECTION_MAP.find(([re]) => re.test(line));
    if (section) {
      out.push('');
      out.push(section[1]);
      continue;
    }

    // "Company · Full-time" → "Company"; strip duration tails.
    line = line.replace(EMPLOYMENT_TYPES, '').replace(DURATION_TAIL, '').trim();
    if (!line) continue;
    // Strip trailing "· Contact info" style chrome, then convert LinkedIn's
    // remaining "·" separators (skills, locations) into commas — the
    // canonical delimiter the downstream mappers split on.
    line = line.replace(/\s*·\s*contact info\s*$/i, '').replace(/\s*·\s*/g, ', ').trim();
    if (!line) continue;

    // Bare "Jan 2020 - Present · 3 yrs" date line → "(Jan 2020 - Present)"
    const dm = line.match(LINKEDIN_DATE_LINE);
    if (dm) {
      const end = /present/i.test(dm[2]) ? 'Present' : dm[2];
      out.push(`(${dm[1]} - ${end})`);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
