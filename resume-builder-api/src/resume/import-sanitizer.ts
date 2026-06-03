type ContactShape = {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
};

type ExperienceShape = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights: string[];
};

type EducationShape = {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  details: string[];
};

type ProjectShape = {
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  highlights: string[];
};

type CertificationShape = {
  name: string;
  issuer?: string;
  date?: string;
  details?: string[];
};

export type SanitizedImportPayload = {
  title: string;
  contact?: ContactShape;
  summary: string;
  skills: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: string[];
  experience: ExperienceShape[];
  education: EducationShape[];
  projects: ProjectShape[];
  certifications: CertificationShape[];
  achievements?: string[];
  unmappedText?: string;
  rejectedBlocks: string[];
};

type ImportInput = {
  title?: unknown;
  contact?: unknown;
  summary?: unknown;
  skills?: unknown;
  technicalSkills?: unknown;
  softSkills?: unknown;
  languages?: unknown;
  experience?: unknown;
  education?: unknown;
  projects?: unknown;
  certifications?: unknown;
  achievements?: unknown;
  unmappedText?: unknown;
};

const PLACEHOLDER_ONLY_RE = /^[-–—_*•·|/\\]+$/;

// Defense-in-depth: strip HTML/script/control characters and dangerous URL
// schemes from any string that flows into the resume from an uploaded file.
// Extracted PDF/DOCX text should never contain HTML, but a hostile upload
// (e.g. SVG, RTF, HTML or a crafted DOCX) could, and we never want such
// content to round-trip into a rendered template or PDF export.
const SCRIPT_TAG_RE = /<script[\s\S]*?<\/script>/gi;
const STYLE_TAG_RE = /<style[\s\S]*?<\/style>/gi;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const JS_PROTOCOL_RE = /javascript\s*:/gi;
const DATA_URL_HTML_RE = /data:text\/html[^,]*,/gi;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function hardenString(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(SCRIPT_TAG_RE, ' ')
    .replace(STYLE_TAG_RE, ' ')
    .replace(HTML_TAG_RE, ' ')
    .replace(JS_PROTOCOL_RE, ' ')
    .replace(DATA_URL_HTML_RE, ' ')
    .replace(CONTROL_CHARS_RE, '');
}

function isSafeLink(value: string): boolean {
  if (typeof value !== 'string' || !value) return false;
  if (JS_PROTOCOL_RE.test(value)) return false;
  if (DATA_URL_HTML_RE.test(value)) return false;
  return /^(https?:\/\/|mailto:|tel:|[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,})/i.test(value);
}

type SanitizeMode = 'upload' | 'persist';

export function sanitizeImportedResume(
  input: ImportInput,
  options?: { mode?: SanitizeMode; sourceText?: string },
): SanitizedImportPayload {
  const mode = options?.mode || 'upload';
  const sourceText = options?.sourceText || '';
  const rejectedBlocks: string[] = [];
  const title = cleanText(input.title) || 'Resume';
  const summary = cleanText(input.summary);
  const skills = uniqueStrings(cleanStringArray(input.skills));
  // Languages + achievements flow through as plain string lists, like
  // skills. Previous version of this sanitizer silently dropped them,
  // which is why uploaded Languages / Achievements sections never
  // surfaced in the editor regardless of how cleanly the parser
  // extracted them — fixed now.
  const technicalSkills = uniqueStrings(cleanStringArray(input.technicalSkills));
  const softSkills = uniqueStrings(cleanStringArray(input.softSkills));
  const languages = uniqueStrings(cleanStringArray(input.languages));
  const achievements = uniqueStrings(cleanStringArray(input.achievements));

  const contact = sanitizeContact(input.contact, rejectedBlocks);
  const experience = deduplicateExperience(sanitizeExperience(input.experience, rejectedBlocks, mode));
  const education = deduplicateEducationEntries(sanitizeEducation(input.education, rejectedBlocks));
  const projects = sanitizeProjects(input.projects, rejectedBlocks);
  const certifications = sanitizeCertifications(input.certifications, rejectedBlocks);

  const unmappedText = mergeUnmappedText(cleanText(input.unmappedText), rejectedBlocks);

  return {
    title,
    contact,
    summary,
    skills,
    technicalSkills,
    softSkills,
    languages,
    experience,
    education,
    projects,
    certifications,
    achievements,
    unmappedText: unmappedText || undefined,
    rejectedBlocks,
  };
}

function sanitizeContact(input: unknown, rejectedBlocks: string[]) {
  if (!isRecord(input)) return undefined;
  const fullName = cleanText(input.fullName);
  const email = cleanText(input.email);
  const phone = cleanText(input.phone);
  const location = cleanText(input.location);
  const links = cleanStringArray(input.links)
    .filter((link) => link.length >= 3)
    .filter((link) => isSafeLink(link));

  // Even without a recognized fullName, preserve email/phone/location/links
  // so that ATS round-trip PDFs (which may have a title in h1 instead of name)
  // still retain contact info for the edit page.
  const hasAnyContact = Boolean(fullName && fullName.length >= 2) || Boolean(email) || Boolean(phone) || Boolean(location) || links.length > 0;
  if (!hasAnyContact) {
    return undefined;
  }

  return {
    fullName: fullName || '',
    email,
    phone,
    location,
    links: links.length ? links : undefined,
  };
}

function sanitizeExperience(input: unknown, rejectedBlocks: string[], mode: SanitizeMode) {
  if (!Array.isArray(input)) return [];
  const output: ExperienceShape[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const company = cleanCompanyName(cleanText(raw.company));
    const role = cleanText(raw.role);
    const startDate = normalizeDateToken(cleanText(raw.startDate));
    const endDate = normalizeDateToken(cleanText(raw.endDate));
    const highlights = uniqueStrings(cleanStringArray(raw.highlights).filter((line) => /[a-z0-9]/i.test(line)));

    const hasCore = Boolean(company || role);
    if (!hasCore) {
      if (startDate || endDate || highlights.length) {
        rejectedBlocks.push(
          buildRejectedLine('Experience', [startDate, endDate, ...highlights]),
        );
      }
      continue;
    }

    // For upload mode: accept any entry with meaningful company or role
    // For persist mode: require at least company and role
    const isUploadValid = company.length >= 2 || role.length >= 2;
    const isStrictValid = company.length >= 2 && role.length >= 2;

    const valid = mode === 'persist' ? isStrictValid : isUploadValid;
    if (!valid) {
      rejectedBlocks.push(
        buildRejectedLine('Experience', [role, company, startDate, endDate, ...highlights]),
      );
      continue;
    }

    output.push({
      company,
      role,
      startDate,
      endDate,
      highlights,
    });
  }
  return output;
}

function sanitizeEducation(input: unknown, rejectedBlocks: string[]) {
  if (!Array.isArray(input)) return [];
  const output: EducationShape[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const institution = cleanText(raw.institution);
    const degree = cleanText(raw.degree);
    const startDate = normalizeDateToken(cleanText(raw.startDate));
    const endDate = normalizeDateToken(cleanText(raw.endDate));
    const details = cleanStringArray(raw.details);

    const hasCore = Boolean(institution || degree);
    if (!hasCore) {
      if (startDate || endDate || details.length) {
        rejectedBlocks.push(
          buildRejectedLine('Education', [startDate, endDate, ...details]),
        );
      }
      continue;
    }

    // Accept education entries that have at least institution or degree;
    // dates and details are optional as many resumes omit them
    const isValid = institution.length >= 2 || degree.length >= 2;

    if (!isValid) {
      rejectedBlocks.push(
        buildRejectedLine('Education', [degree, institution, startDate, endDate, ...details]),
      );
      continue;
    }

    output.push({
      institution,
      degree,
      startDate,
      endDate,
      details,
    });
  }
  return output;
}

function sanitizeProjects(input: unknown, rejectedBlocks: string[]) {
  if (!Array.isArray(input)) return [];
  const output: ProjectShape[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const name = cleanText(raw.name);
    const role = cleanText(raw.role);
    const startDate = normalizeDateToken(cleanText(raw.startDate));
    const endDate = normalizeDateToken(cleanText(raw.endDate));
    const highlights = cleanStringArray(raw.highlights);
    if (!name && !highlights.length) continue;

    const hasInvalidOptional = (role && role.length < 2) || (startDate && startDate.length < 4) || (endDate && endDate.length < 4);
    if (name.length < 2 || highlights.length < 1 || hasInvalidOptional) {
      rejectedBlocks.push(buildRejectedLine('Project', [name, role, startDate, endDate, ...highlights]));
      continue;
    }

    output.push({
      name,
      role: role || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      highlights,
    });
  }
  return output;
}

function sanitizeCertifications(input: unknown, rejectedBlocks: string[]) {
  if (!Array.isArray(input)) return [];
  const output: CertificationShape[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const name = cleanText(raw.name);
    const issuer = cleanText(raw.issuer);
    const date = normalizeDateToken(cleanText(raw.date));
    const details = cleanStringArray(raw.details);
    const hasInvalidOptional = (issuer && issuer.length < 2) || (date && date.length < 4);
    if (!name && !details.length) continue;
    if (name.length < 2 || hasInvalidOptional) {
      rejectedBlocks.push(buildRejectedLine('Certification', [name, issuer, date, ...details]));
      continue;
    }
    output.push({
      name,
      issuer: issuer || undefined,
      date: date || undefined,
      details: details.length ? details : undefined,
    });
  }
  return output;
}

function cleanStringArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function cleanText(input: unknown) {
  if (typeof input !== 'string') return '';
  const hardened = hardenString(input);
  const normalized = hardened.replace(/\s+/g, ' ').trim();
  if (!normalized || PLACEHOLDER_ONLY_RE.test(normalized)) return '';
  return normalized;
}

function cleanCompanyName(input: string) {
  if (!input) return '';
  return input
    .replace(/\(([^)]+)\)\s*$/g, '')
    .replace(/[|@-]\s*$/g, '')
    .trim();
}

function looksLikeCompany(value: string) {
  if (!value) return false;
  if (/(inc|llc|ltd|corp|company|technologies|systems|labs|solutions|group|studio|partners|bank|consulting|digital)\b/i.test(value)) {
    return true;
  }
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 7) return false;
  const titleCaseTokens = tokens.filter((token) => /^[A-Z][A-Za-z0-9&'.-]*$/.test(token)).length;
  return titleCaseTokens >= Math.ceil(tokens.length * 0.6);
}

function normalizeDateToken(token: string) {
  if (!token) return '';
  if (/present|current|now/i.test(token)) return 'Present';
  return token;
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function buildRejectedLine(prefix: string, parts: string[]) {
  const text = parts.filter(Boolean).join(' | ').trim();
  return `${prefix} (From Upload): ${text || 'Unstructured content'}`;
}

function mergeUnmappedText(existing: string, rejected: string[]) {
  const merged = [existing, ...rejected].map((item) => item.trim()).filter(Boolean);
  return uniqueStrings(merged).join('\n').trim();
}

/**
 * Anti-hallucination guard: verify that key extracted values actually appear
 * in the source text. Rejects entries that cannot be traced back to the original.
 */
function validateAgainstSource(value: string, sourceText: string, threshold = 0.6): boolean {
  if (!sourceText || !value) return true; // No source to validate against
  const normalizedSource = sourceText.toLowerCase().replace(/\s+/g, ' ');
  const normalizedValue = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalizedValue || normalizedValue.length < 3) return true;
  // Direct substring match
  if (normalizedSource.includes(normalizedValue)) return true;
  // Check if significant words from the value appear in the source
  const words = normalizedValue.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const matchingWords = words.filter((w) => normalizedSource.includes(w));
  return matchingWords.length / words.length >= threshold;
}

function deduplicateExperience(items: ExperienceShape[]): ExperienceShape[] {
  const seen = new Map<string, ExperienceShape>();
  for (const item of items) {
    const companyKey = (item.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const roleKey = (item.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${companyKey}|${roleKey}`;
    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }
    const existing = seen.get(key)!;
    // Merge highlights, keep earliest start and latest end
    existing.highlights = uniqueStrings([...existing.highlights, ...item.highlights]);
    if (!existing.startDate && item.startDate) existing.startDate = item.startDate;
    if (!existing.endDate && item.endDate) existing.endDate = item.endDate;
  }
  return Array.from(seen.values());
}

function deduplicateEducationEntries(items: EducationShape[]): EducationShape[] {
  const seen = new Map<string, EducationShape>();
  for (const item of items) {
    const instKey = (item.institution || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const degKey = (item.degree || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${instKey}|${degKey}`;
    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }
    const existing = seen.get(key)!;
    existing.institution = existing.institution || item.institution;
    existing.degree = existing.degree || item.degree;
    existing.startDate = existing.startDate || item.startDate;
    existing.endDate = existing.endDate || item.endDate;
    existing.details = uniqueStrings([...existing.details, ...item.details]);
  }
  return Array.from(seen.values());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
