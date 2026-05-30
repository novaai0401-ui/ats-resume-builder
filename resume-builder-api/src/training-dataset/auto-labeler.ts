/**
 * Auto-labeler — when a user uploads a resume, the initial machine
 * extraction is a NOISY label. When the user then opens the editor
 * and confirms / corrects the fields, the result is a GOLD label.
 *
 * This module converts a user-confirmed Resume payload into the
 * `structuredLabel` shape we store in TrainingSample. Strips empty
 * fields, normalizes dates, and drops trivially short bullets (which
 * are usually editor placeholders, not real content).
 */

const MIN_BULLET_LEN = 8;

interface MaybeResume {
  contact?: Record<string, unknown> | null;
  summary?: string | null;
  skills?: unknown[] | null;
  experience?: Array<Record<string, unknown>> | null;
  education?: Array<Record<string, unknown>> | null;
  projects?: Array<Record<string, unknown>> | null;
  certifications?: Array<Record<string, unknown>> | null;
}

export function buildStructuredLabel(resume: MaybeResume): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (resume.contact && typeof resume.contact === 'object') {
    const c = pickNonEmpty(resume.contact, ['fullName', 'email', 'phone', 'location', 'linkedin', 'website']);
    if (Object.keys(c).length) out.contact = c;
  }

  if (typeof resume.summary === 'string' && resume.summary.trim()) {
    out.summary = resume.summary.trim();
  }

  if (Array.isArray(resume.skills)) {
    const skills = resume.skills
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0);
    if (skills.length) out.skills = Array.from(new Set(skills));
  }

  if (Array.isArray(resume.experience)) {
    const exp = resume.experience
      .map(cleanExperience)
      .filter((e): e is Record<string, unknown> => Boolean(e));
    if (exp.length) out.experience = exp;
  }

  if (Array.isArray(resume.education)) {
    const edu = resume.education
      .map(cleanEducation)
      .filter((e): e is Record<string, unknown> => Boolean(e));
    if (edu.length) out.education = edu;
  }

  if (Array.isArray(resume.projects)) {
    const proj = resume.projects
      .map((p) => pickNonEmpty(p, ['name', 'description', 'role', 'startDate', 'endDate', 'url']))
      .filter((p) => Object.keys(p).length > 0);
    if (proj.length) out.projects = proj;
  }

  if (Array.isArray(resume.certifications)) {
    const cert = resume.certifications
      .map((c) => pickNonEmpty(c, ['name', 'issuer', 'date']))
      .filter((c) => Object.keys(c).length > 0);
    if (cert.length) out.certifications = cert;
  }

  return out;
}

function cleanExperience(entry: Record<string, unknown>): Record<string, unknown> | null {
  const cleaned = pickNonEmpty(entry, ['role', 'company', 'startDate', 'endDate', 'location']);
  if (!cleaned.role && !cleaned.company) return null;
  const rawHighlights = Array.isArray(entry.highlights) ? entry.highlights : [];
  const highlights = rawHighlights
    .map((h) => (typeof h === 'string' ? h.trim() : ''))
    .filter((h) => h.length >= MIN_BULLET_LEN);
  if (highlights.length) cleaned.highlights = highlights;
  return Object.keys(cleaned).length ? cleaned : null;
}

function cleanEducation(entry: Record<string, unknown>): Record<string, unknown> | null {
  const cleaned = pickNonEmpty(entry, ['institution', 'degree', 'startDate', 'endDate']);
  if (!cleaned.institution && !cleaned.degree) return null;
  return cleaned;
}

function pickNonEmpty(
  source: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Heuristic quality filter — refuses to convert obviously incomplete
 * resumes into training labels. A label without any experience AND
 * without any education is signal-free and would teach the model the
 * wrong distribution.
 */
export function isLabelHighEnoughQuality(label: Record<string, unknown>): boolean {
  const hasExp = Array.isArray(label.experience) && label.experience.length > 0;
  const hasEdu = Array.isArray(label.education) && label.education.length > 0;
  const hasContact = label.contact && typeof label.contact === 'object';
  return Boolean(hasContact && (hasExp || hasEdu));
}
