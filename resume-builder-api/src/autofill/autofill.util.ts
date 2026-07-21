import type { AutofillProfile } from 'resume-builder-shared';

/**
 * R-093 — flatten a resume row into the flat field set an ATS
 * application form asks for, so the browser extension can autofill
 * (name, email, phone, location, links, current role, education,
 * skills). Pure + defensive: every resume JSON column is untrusted
 * shape, so we read it tolerantly and always return strings (never
 * undefined) so the extension can assign directly to inputs.
 */

type Loose = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function arr(v: unknown): Loose[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Loose[]) : [];
}

/** Split a full name into first / last on the last space. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/** Best-effort split of a "City, State, Country" style location string. */
export function splitLocation(location: string): { city: string; state: string; country: string } {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: '', state: '', country: '' };
  if (parts.length === 1) return { city: parts[0], state: '', country: '' };
  if (parts.length === 2) return { city: parts[0], state: '', country: parts[1] };
  return { city: parts[0], state: parts[1], country: parts.slice(2).join(', ') };
}

const LINKEDIN_RE = /linkedin\.com/i;

export function buildAutofillProfile(resume: Loose | null | undefined): AutofillProfile {
  const contact = (resume?.contact && typeof resume.contact === 'object' ? resume.contact : {}) as Loose;
  const fullName = str(contact.fullName);
  const { firstName, lastName } = splitName(fullName);
  const location = str(contact.location);
  const { city, state, country } = splitLocation(location);

  const links = Array.isArray(contact.links) ? contact.links.map(str).filter(Boolean) : [];
  const linkedinUrl = links.find((l) => LINKEDIN_RE.test(l)) || '';
  const websiteUrl = links.find((l) => !LINKEDIN_RE.test(l)) || '';

  // Current role = the first experience entry (resumes are stored most-recent-first).
  const experience = arr(resume?.experience);
  const current = experience[0] || {};
  const currentTitle = str(current.role) || str(current.title);
  const currentCompany = str(current.company);

  const education = arr(resume?.education);
  const edu = education[0] || {};
  const school = str(edu.institution) || str(edu.school);
  const degree = str(edu.degree);

  // Skills can be a flat string[] or categorized objects — take the flat
  // values, dedupe, cap at 30 (ATS skill fields are short).
  const rawSkills = resume?.skills;
  const skills = Array.isArray(rawSkills)
    ? Array.from(new Set(rawSkills.map(str).filter(Boolean))).slice(0, 30)
    : [];

  return {
    firstName,
    lastName,
    fullName,
    email: str(contact.email),
    phone: str(contact.phone),
    location,
    city,
    state,
    country,
    linkedinUrl,
    websiteUrl,
    currentTitle,
    currentCompany,
    school,
    degree,
    skills,
    summary: str(resume?.summary),
  };
}
