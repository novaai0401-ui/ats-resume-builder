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

/**
 * LinkedIn app chrome that is NOT resume content — global nav, the
 * messaging overlay, feed actions, avatar alt-text ("X picture"), promoted
 * posts, connection-degree badges, follower counts, etc. A whole-page
 * Ctrl+A copy pulls all of this in; left in, the parser invents phantom
 * "companies" from feed posts (the reported "8 companies" bug).
 */
const LINKEDIN_CHROME_LINE = new RegExp(
  '^(' +
  // global nav / top bar
  'home|my network|jobs|messaging|notifications|me|work|search|for business|' +
  'try premium.*|advertise|reactivate premium.*|get the app|' +
  // messaging overlay
  'compose message|you are on the messaging overlay.*|press enter to open.*|' +
  'open messenger|new message|status is (online|offline|reachable|away).*|' +
  'no new notifications|messaging$|' +
  // feed
  'scrolled to top of feed|start a post|start writing.*|feed post.*|' +
  'promoted|sponsored|suggested|people you may know.*|add to your feed|' +
  'add a comment.*|most relevant.*|create a post|share a post|' +
  // post actions / social
  'like|likes|comment|comments|repost|reposts|share|send|save|saved|' +
  'follow|following|unfollow|connect|message|more|see more|see all|see less|' +
  'show all.*|show more|show less|view profile|view full profile|' +
  // counts / badges
  '\\d[\\d,\\.]*\\+?\\s*(followers?|connections?|reactions?|comments?|reposts?|views?|impressions?)|' +
  '•?\\s*(1st|2nd|3rd)(\\s*degree.*)?|' +
  // misc chrome
  'activity|ad|ads|linkedin|skip to.*|contact info|' +
  '.+\\s+picture' +               // avatar alt-text: "TEKIVEX picture", "John Doe picture"
  ')$',
  'i',
);

/** Strong markers that a paste is the HOME FEED / app shell, not a profile. */
const LINKEDIN_FEED_MARKERS = [
  /you are on the messaging overlay/i,
  /scrolled to top of feed/i,
  /compose message/i,
  /start a post/i,
  /\bpromoted\b/i,
  /people you may know/i,
];

/** Profile-page markers we expect a real profile paste to contain. */
const LINKEDIN_PROFILE_MARKERS = [
  /^about$/im,
  /^experience$/im,
  /^education$/im,
  /^licenses?\s*&?\s*certifications?$/im,
  /^skills$/im,
  /·\s*(full|part)[- ]?time/i,
];

/**
 * Detect a "wrong page" paste — the LinkedIn home feed / app shell rather
 * than a profile. True when feed chrome is present AND no profile section
 * markers are found. The upload flow uses this to give a clear, actionable
 * error instead of building a resume out of feed noise.
 */
export function looksLikeLinkedInFeedDump(text: string): boolean {
  const t = String(text || '');
  const feedHits = LINKEDIN_FEED_MARKERS.filter((re) => re.test(t)).length;
  const profileHits = LINKEDIN_PROFILE_MARKERS.filter((re) => re.test(t)).length;
  return feedHits >= 1 && profileHits === 0;
}

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

/** Markdown link: `[text](url)` — the "copy as markdown" LinkedIn paste shape. */
const MD_LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
/** A line that is ONLY an employment type (LinkedIn prints it alone under grouped roles). */
const EMPLOYMENT_TYPE_ONLY = /^(full[- ]?time|part[- ]?time|contract|internship|freelance|self[- ]?employed|apprenticeship|seasonal|temporary)$/i;
/** A line that is ONLY a duration ("6 yrs 2 mos" under a grouped company header). */
const BARE_DURATION = /^\d+\s*(?:yrs?|years?)(?:\s*\d+\s*(?:mos?|months?))?$|^\d+\s*(?:mos?|months?)$/i;
/** LinkedIn workplace-type tail on location lines — any country, any language variant LinkedIn ships. */
const WORKPLACE_TAIL = /[,·]?\s*(on[- ]?site|hybrid|remote)\s*$/i;
/** LinkedIn's "Skill A, Skill B and +17 skills" association footer under a role. */
const SKILL_ASSOC_LINE = /\band\s\+\d+\s+skills?$|^\S[^,]*,.*\+\d+\s+skills?$/i;

/**
 * Structural location test for the line that follows a date inside
 * Experience/Education. LinkedIn's block order is fixed worldwide —
 * Role / Company · Type / Dates / Location / bullets — so position is the
 * primary signal; the shape check (short, comma-separated or a
 * geography-suffix word, no digits, not a sentence) merely keeps real
 * bullets safe. Deliberately NOT a country list: profiles come from
 * anywhere.
 */
function looksLikeLocationAfterDate(line: string): boolean {
  if (WORKPLACE_TAIL.test(line)) return true;
  if (/\b(area|region|district|division)$/i.test(line)) return true;
  if (!line.includes(',')) return false;
  if (/\d/.test(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  return line.split(/\s+/).length <= 8;
}

/** Rewrite a LinkedIn paste into parser-friendly resume text. */
export function normalizeLinkedInProfileText(text: string): string {
  const out: string[] = [];
  const rawLines = String(text || '').split('\n');
  // Grouped-positions state: `[Company](…/company/…)` header lines announce
  // an employer whose roles follow as starred sub-entries WITHOUT their own
  // company line. Remember it and re-emit it after each such role so every
  // entry reaches the parser in canonical Role / Company / (Dates) shape.
  let pendingCompany = '';
  let inEntrySection = false; // Experience/Education — where location lines live
  let lastWasDate = false;

  for (const raw of rawLines) {
    const rawTrimmed = raw.trim();
    // Markdown bullet marker for grouped sub-roles ("* [Role](…position…)").
    const starred = /^[*-]\s+\[/.test(rawTrimmed);
    let line = rawTrimmed.replace(/^[*-]\s+(?=\[)/, '');

    // Resolve markdown links using the URL as a line classifier.
    let isCompanyAnchor = false;
    const links = [...line.matchAll(MD_LINK)];
    if (links.length) {
      // "…and +17 skills" association overlays are pure LinkedIn chrome.
      if (links.some(([, , url]) => /skill-associations/i.test(url))) continue;
      isCompanyAnchor = links.some(([, , url]) => /linkedin\.com\/company\//i.test(url));
      line = line.replace(MD_LINK, (_, label: string) => label).trim();
    }

    line = dedupeDoubledLine(line);
    if (!line) continue;
    // Drop LinkedIn app chrome (nav, messaging overlay, feed, avatar
    // alt-text, social actions) that never belongs on a resume.
    if (LINKEDIN_CHROME_LINE.test(line)) continue;
    // Image alt-text ("Acme Corp logo") and education grade footers.
    if (/\slogo$/i.test(line)) continue;
    if (/^grade\s*:/i.test(line)) continue;

    // Section heading?
    const section = LINKEDIN_SECTION_MAP.find(([re]) => re.test(line));
    if (section) {
      out.push('');
      out.push(section[1]);
      pendingCompany = '';
      inEntrySection = section[1] === 'WORK EXPERIENCE' || section[1] === 'EDUCATION';
      lastWasDate = false;
      continue;
    }

    // "Company · Full-time" → "Company"; strip duration tails and the
    // truncation marker LinkedIn appends to collapsed text.
    line = line.replace(EMPLOYMENT_TYPES, '').replace(DURATION_TAIL, '').replace(/(\.\.\.|…)\s*more$/i, '').trim();
    if (!line) continue;
    // Lines that were NOTHING BUT type/duration ("Full-time", "6 yrs 2 mos")
    // sit under grouped roles and must not become companies or bullets.
    if (EMPLOYMENT_TYPE_ONLY.test(line) || BARE_DURATION.test(line)) continue;
    if (inEntrySection && SKILL_ASSOC_LINE.test(line)) continue;
    // Strip trailing "· Contact info" style chrome, then convert LinkedIn's
    // remaining "·" separators (skills, locations) into commas — the
    // canonical delimiter the downstream mappers split on.
    line = line.replace(/\s*·\s*contact info\s*$/i, '').replace(/\s*·\s*/g, ', ').trim();
    if (!line) continue;

    // A grouped-company header: remember it, emit nothing yet.
    if (isCompanyAnchor && inEntrySection) {
      pendingCompany = line;
      lastWasDate = false;
      continue;
    }

    // Bare "Jan 2020 - Present · 3 yrs" date line → "(Jan 2020 - Present)"
    const dm = line.match(LINKEDIN_DATE_LINE);
    if (dm) {
      const end = /present/i.test(dm[2]) ? 'Present' : dm[2];
      out.push(`(${dm[1]} - ${end})`);
      lastWasDate = true;
      continue;
    }

    // The line under a date in Experience/Education is the entry's location
    // — never a company and never an achievement. Dropping it here is what
    // stops "Pune Division, Maharashtra, India" (or "Greater Toronto Area,
    // Canada, Hybrid") from becoming a bullet.
    if (inEntrySection && lastWasDate && looksLikeLocationAfterDate(line)) {
      lastWasDate = false;
      continue;
    }
    lastWasDate = false;

    // A starred sub-role under a grouped company: emit Role then Company so
    // the entry is self-contained for the parser.
    if (starred && inEntrySection && pendingCompany && !line.startsWith('•')) {
      out.push(line);
      out.push(pendingCompany);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
