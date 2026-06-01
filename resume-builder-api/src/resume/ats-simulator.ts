/**
 * ATS Simulator — shows the user what a real applicant-tracking system
 * will actually see when it ingests their resume.
 *
 * Why this exists: every competitor scores resumes against keywords. None
 * of them show the user the LITERAL TEXT a recruiter will see in their
 * Workday / Greenhouse / iCIMS dashboard after the ATS has stripped
 * styling, dropped tables, and best-effort-parsed the file. That gap is
 * where most "I had a 95% ATS score but heard nothing back" stories come
 * from.
 *
 * Design choices:
 *  - Pure function over a structured Resume payload. No file parsing
 *    here — the upload pipeline already produced fields; this layer
 *    just simulates what survives the next hop.
 *  - Generic "ATS pipeline view" for v1. Vendor-specific variants
 *    (Workday strips section X, Greenhouse keeps Y) come later — the
 *    common-denominator output already catches 80% of the problems.
 *  - Conservative: when uncertain whether content would survive, the
 *    simulator marks it as a RISK, not a guaranteed drop. False
 *    positives here are cheap; false negatives ("we promised your
 *    resume would parse cleanly and it didn't") are not.
 */

export interface SimulatedResumeInput {
  title?: string | null;
  contact?: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedin?: string | null;
    website?: string | null;
  } | null;
  summary?: string | null;
  skills?: string[] | null;
  experience?: Array<{
    role?: string | null;
    company?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    location?: string | null;
    highlights?: string[] | null;
  }> | null;
  education?: Array<{
    institution?: string | null;
    degree?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }> | null;
  projects?: Array<{
    name?: string | null;
    description?: string | null;
  }> | null;
  certifications?: Array<{ name?: string | null; issuer?: string | null }> | null;
}

export type SimulationRiskKind =
  | 'contact-missing-email'
  | 'contact-missing-phone'
  | 'contact-missing-name'
  | 'summary-too-long'
  | 'summary-wall-of-text'
  | 'bullet-too-long'
  | 'bullet-weak-starter'
  | 'experience-no-dates'
  | 'experience-non-chronological'
  | 'education-no-dates'
  | 'skills-too-few'
  | 'skills-too-many'
  | 'creative-date-format';

export interface SimulationRisk {
  kind: SimulationRiskKind;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  /** Optional field path the risk attaches to, for UI highlighting. */
  path?: string;
}

export interface SimulationResult {
  /** What the ATS will hand the recruiter, as plain text. */
  recruiterView: string;
  /** Same content, broken into canonical fields, with empty values
   *  rendered as explicit "(missing)" tokens so the user sees the holes. */
  fields: Array<{ label: string; value: string; missing: boolean }>;
  /** Ranked list of parse risks. */
  risks: SimulationRisk[];
  /** A 0-100 confidence score: how reliably this resume will parse. */
  confidence: number;
}

const BULLET_SAFE_WORDS = 28;
const SUMMARY_SAFE_WORDS = 90;
const WEAK_STARTERS = new Set([
  'responsible', 'worked', 'helped', 'assisted', 'tried', 'attempted',
  'duties', 'tasks', 'involved',
]);
const ISO_DATE_RE = /^\d{4}(-\d{2})?(-\d{2})?$/;
const MONTH_YEAR_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}$/i;
const PRESENT_RE = /^(present|current|now|till\s*date|ongoing)$/i;

export function simulateAts(input: SimulatedResumeInput): SimulationResult {
  const risks: SimulationRisk[] = [];
  const lines: string[] = [];
  const fields: SimulationResult['fields'] = [];

  // ----- Contact ---------------------------------------------------------
  const contact = input.contact || {};
  const name = clean(contact.fullName);
  const email = clean(contact.email);
  const phone = clean(contact.phone);
  const location = clean(contact.location);

  pushField(fields, 'Name', name);
  pushField(fields, 'Email', email);
  pushField(fields, 'Phone', phone);
  pushField(fields, 'Location', location);

  if (!name) risks.push({ kind: 'contact-missing-name', severity: 'high', detail: 'No name detected — the recruiter sees a nameless application.', path: 'contact.fullName' });
  if (!email) risks.push({ kind: 'contact-missing-email', severity: 'high', detail: 'No email surfaced. Most ATS systems use email as the primary candidate key.', path: 'contact.email' });
  if (!phone) risks.push({ kind: 'contact-missing-phone', severity: 'medium', detail: 'No phone number. Some ATS systems mark records "incomplete" without one.', path: 'contact.phone' });

  if (name) lines.push(name);
  const contactLine = [email, phone, location].filter(Boolean).join(' · ');
  if (contactLine) lines.push(contactLine);

  // ----- Summary ---------------------------------------------------------
  const summary = clean(input.summary);
  pushField(fields, 'Summary', summary);
  if (summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(summary);
    const words = wordCount(summary);
    if (words > SUMMARY_SAFE_WORDS) {
      risks.push({
        kind: 'summary-too-long',
        severity: 'medium',
        detail: `Summary is ${words} words; recruiters skim ~6 seconds. Under ${SUMMARY_SAFE_WORDS} words is safer.`,
        path: 'summary',
      });
    }
    const sentences = summary.split(/[.!?](?:\s|$)/).filter((s) => s.trim());
    if (sentences.length >= 1 && words >= 60 && sentences.length === 1) {
      risks.push({
        kind: 'summary-wall-of-text',
        severity: 'low',
        detail: 'Summary is a single long sentence. Two or three short sentences land better.',
        path: 'summary',
      });
    }
  }

  // ----- Skills ----------------------------------------------------------
  const skills = (input.skills || []).map(clean).filter(Boolean) as string[];
  pushField(fields, 'Skills', skills.join(', '));
  if (skills.length > 0) {
    lines.push('');
    lines.push('SKILLS');
    lines.push(skills.join(' · '));
  }
  if (skills.length < 5) {
    risks.push({
      kind: 'skills-too-few',
      severity: skills.length === 0 ? 'high' : 'medium',
      detail: `Only ${skills.length} skill${skills.length === 1 ? '' : 's'} listed. ATS keyword filters typically scan for 8-20.`,
      path: 'skills',
    });
  } else if (skills.length > 40) {
    risks.push({
      kind: 'skills-too-many',
      severity: 'low',
      detail: `${skills.length} skills is a lot — many ATS configurations cap at 30 and silently truncate.`,
      path: 'skills',
    });
  }

  // ----- Experience ------------------------------------------------------
  const experience = input.experience || [];
  if (experience.length > 0) {
    lines.push('');
    lines.push('EXPERIENCE');
  }
  let prevEndYear: number | null = null;
  experience.forEach((exp, i) => {
    const role = clean(exp.role);
    const company = clean(exp.company);
    const start = clean(exp.startDate);
    const end = clean(exp.endDate);
    const dateRange = [start, end].filter(Boolean).join(' – ');

    const header = [role, company].filter(Boolean).join(' · ');
    lines.push(header || '(unnamed role)');
    if (dateRange) lines.push(dateRange);

    const bullets = (exp.highlights || []).map(clean).filter(Boolean) as string[];
    for (const b of bullets) {
      lines.push(`• ${b}`);
      const words = wordCount(b);
      if (words > BULLET_SAFE_WORDS) {
        risks.push({
          kind: 'bullet-too-long',
          severity: 'low',
          detail: `Bullet in "${role || 'role'}" is ${words} words; ${BULLET_SAFE_WORDS} or fewer is the ATS-safe ceiling.`,
          path: `experience[${i}].highlights`,
        });
      }
      const first = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '';
      if (WEAK_STARTERS.has(first)) {
        risks.push({
          kind: 'bullet-weak-starter',
          severity: 'low',
          detail: `Bullet starts with "${first}" — action verbs perform better in keyword filters.`,
          path: `experience[${i}].highlights`,
        });
      }
    }

    if (!start && !end) {
      risks.push({
        kind: 'experience-no-dates',
        severity: 'high',
        detail: `${role || 'A role'} has no dates. ATS chronology sorting will skip this entry.`,
        path: `experience[${i}]`,
      });
    } else {
      const endYear = extractYear(end) ?? extractYear(start);
      if (endYear && prevEndYear && endYear > prevEndYear) {
        risks.push({
          kind: 'experience-non-chronological',
          severity: 'medium',
          detail: `Experience appears out of chronological order around "${role || company}". ATS sorts most-recent first.`,
          path: `experience[${i}]`,
        });
      }
      if (endYear) prevEndYear = endYear;
    }
    if (start && !looksParseable(start)) {
      risks.push({
        kind: 'creative-date-format',
        severity: 'low',
        detail: `Start date "${start}" may not parse cleanly. Prefer "Jan 2024" or "2024-01".`,
        path: `experience[${i}].startDate`,
      });
    }
    if (end && !looksParseable(end) && !PRESENT_RE.test(end)) {
      risks.push({
        kind: 'creative-date-format',
        severity: 'low',
        detail: `End date "${end}" may not parse cleanly. Prefer "Jan 2024" or "Present".`,
        path: `experience[${i}].endDate`,
      });
    }

    pushField(fields, `Experience #${i + 1}`, [header, dateRange, bullets.map((b) => `• ${b}`).join('\n')].filter(Boolean).join('\n'));
  });

  // ----- Education -------------------------------------------------------
  const education = input.education || [];
  if (education.length > 0) {
    lines.push('');
    lines.push('EDUCATION');
  }
  education.forEach((edu, i) => {
    const institution = clean(edu.institution);
    const degree = clean(edu.degree);
    const start = clean(edu.startDate);
    const end = clean(edu.endDate);
    const dateRange = [start, end].filter(Boolean).join(' – ');
    const header = [degree, institution].filter(Boolean).join(' · ');
    lines.push(header || '(unnamed program)');
    if (dateRange) lines.push(dateRange);
    if (!start && !end) {
      risks.push({
        kind: 'education-no-dates',
        severity: 'medium',
        detail: `${institution || 'An education entry'} has no dates. Filters that gate on graduation year will skip it.`,
        path: `education[${i}]`,
      });
    }
    pushField(fields, `Education #${i + 1}`, [header, dateRange].filter(Boolean).join('\n'));
  });

  // ----- Confidence ------------------------------------------------------
  const weight: Record<SimulationRisk['severity'], number> = { high: 14, medium: 7, low: 3 };
  const penalty = risks.reduce((acc, r) => acc + weight[r.severity], 0);
  const confidence = Math.max(0, Math.min(100, 100 - penalty));

  // Sort: severity first, then natural insertion order.
  const sevOrder: Record<SimulationRisk['severity'], number> = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return {
    recruiterView: lines.join('\n').replace(/\n{3,}/g, '\n\n'),
    fields,
    risks,
    confidence,
  };
}

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function pushField(out: SimulationResult['fields'], label: string, value: string) {
  out.push({ label, value, missing: !value });
}

function extractYear(token: string): number | null {
  const m = token.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function looksParseable(token: string): boolean {
  return ISO_DATE_RE.test(token) || MONTH_YEAR_RE.test(token) || PRESENT_RE.test(token) || /^\d{4}$/.test(token);
}
