export type CanonicalSection =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'unmapped';

const SECTION_SYNONYMS: Record<CanonicalSection, string[]> = {
  summary: [
    'summary', 'professional summary', 'pro essional summary', 'profile', 'profile summary',
    'pro le summary', 'about', 'about me', 'objective', 'career summary', 'career objective',
    'executive summary', 'personal statement', 'introduction',
    // LinkedIn / Indeed / Naukri / Glassdoor resume formats
    'professional profile', 'personal profile', 'career profile', 'overview', 'professional overview',
    'career overview', 'professional objective', 'job objective', 'headline',
    'professional headline', 'bio', 'biography', 'about the candidate',
    // Modern AI / LinkedIn / European CV variants
    'professional snapshot', 'snapshot', 'value proposition', 'elevator pitch',
    'who i am', 'my mission', 'my story', 'background',
  ],
  skills: [
    'skills',
    'technical skills',
    'core skills',
    'key skills',
    'key skill',
    'competencies',
    'core competencies',
    'key competencies',
    'technologies',
    'soft skills',
    'languages',
    'tools and technologies',
    'technical competencies',
    'areas of expertise',
    'expertise',
    'technical expertise',
    'technical proficiencies',
    'proficiencies',
    'skill set',
    'functional skills',
    'domain expertise',
    // Additional formats from popular resume builders
    'tools',
    'tech stack',
    'technology stack',
    'programming languages',
    'frameworks',
    'tools technologies',
    'technical proficiency',
    'it skills',
    'computer skills',
    'software skills',
    'hard skills',
    'professional skills',
    'relevant skills',
    'additional skills',
    'other skills',
    'skills and tools',
    'skills and competencies',
    'skills and abilities',
    'tools frameworks',
    'platforms',
    'operating systems',
    'databases',
    'cloud technologies',
    'devops tools',
    // Modern AI/data variants
    'machine learning', 'ml skills', 'ai skills', 'data skills',
    'libraries', 'libraries and frameworks', 'libraries frameworks',
    'methodologies', 'methods and tools', 'specializations', 'specialisation',
    'specializations and tools',
  ],
  experience: [
    'experience',
    'work experience',
    'work history',
    'employment',
    'employment history',
    'professional experience',
    'pro essional experience',
    'career history',
    'professional background',
    'relevant experience',
    'industry experience',
    // Additional formats from LinkedIn, Naukri, Indeed
    'employment details',
    'job history',
    'positions held',
    'professional history',
    'work details',
    'career experience',
    'professional work experience',
    'relevant work experience',
    'internship experience',
    'internships',
    'freelance experience',
    'consulting experience',
    'contract experience',
    'previous employment',
    'past experience',
    'job experience',
    'apprenticeship', 'apprenticeships', 'practical experience', 'industrial training',
    'engagements', 'client engagements', 'project assignments', 'assignments',
  ],
  education: [
    'education', 'academics', 'academic background', 'education history', 'qualifications',
    'quali cations', 'educational qualifications', 'academic qualifications', 'academic details',
    // Additional formats
    'educational background', 'education details', 'academic record',
    'educational details', 'academic credentials', 'degrees',
    'academic history', 'scholastic record', 'university education',
    'college education', 'educational history', 'schooling',
  ],
  projects: [
    'projects', 'notable projects', 'research', 'achievements', 'accomplishments',
    'key projects', 'project experience', 'key achievements',
    // Additional formats
    'personal projects', 'side projects', 'academic projects',
    'professional projects', 'project details', 'portfolio',
    'research projects', 'open source contributions', 'open source',
    'contributions', 'publications', 'papers',
    'awards', 'honors', 'honors and awards', 'awards and achievements',
    'extracurricular activities', 'volunteer experience', 'volunteering',
  ],
  certifications: [
    'certifications', 'certi cations', 'licenses', 'certificates', 'professional certifications',
    'pro essional certi cations', 'training', 'training and certifications', 'courses',
    // Additional formats
    'professional development', 'continuing education', 'credentials',
    'accreditations', 'certification details', 'online courses',
    'moocs', 'workshops', 'seminars', 'professional training',
    'licenses and certifications', 'certifications and courses',
    'certifications and licenses', 'certification and training',
  ],
  unmapped: [],
};

export function normalizeHeading(line: string): CanonicalSection | '' {
  const pageFooterHeading = line.match(/--\s*\d+\s*of\s*\d+\s*--\s*([a-z][a-z\s]+)$/i);
  if (pageFooterHeading && pageFooterHeading[1]) {
    const nested = normalizeHeading(pageFooterHeading[1]);
    if (nested) return nested;
  }

  const normalized = line
    .toLowerCase()
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' ')
    .replace(/[:\s]+$/g, '')
    // Normalize Unicode ligatures before stripping non-alpha chars
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (!isHeadingLike(line, normalized)) return '';
  for (const [section, synonyms] of Object.entries(SECTION_SYNONYMS)) {
    if (synonyms.includes(normalized)) return section as CanonicalSection;
  }
  return /:\s*$/.test(line) ? 'unmapped' : '';
}

// Build KNOWN_HEADING_PHRASES from all SECTION_SYNONYMS values
const KNOWN_HEADING_PHRASES = new Set(
  Object.values(SECTION_SYNONYMS).flat().filter(Boolean),
);

function isHeadingLike(rawLine: string, normalized: string) {
  const raw = String(rawLine || '').trim();
  if (!raw || raw.length > 80) return false;
  if (/^[\-*•·]/.test(raw)) return false;
  if (/[.,;!?]/.test(raw) && !/:\s*$/.test(raw)) return false;
  if (/\d{2,}/.test(raw) && !/--\s*\d+\s*of\s*\d+\s*--/.test(raw)) return false;
  if (/:\s*$/.test(raw)) return true;

  // Check known heading phrases BEFORE rejecting lowercase-only lines
  if (KNOWN_HEADING_PHRASES.has(normalized)) return true;

  // ALL CAPS lines that match a known pattern are headings
  if (/^[A-Z\s&/]+$/.test(raw) && raw.length <= 40 && KNOWN_HEADING_PHRASES.has(normalized)) return true;

  if (/^[a-z\s]+$/.test(raw)) return false;

  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const headingWords = words.filter((word) => /^[A-Z][A-Za-z0-9&'()./-]*$/.test(word) || /^[A-Z]{2,}$/.test(word));
  if (headingWords.length >= Math.ceil(words.length * 0.6)) return true;

  return false;
}
