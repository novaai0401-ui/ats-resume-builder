export type CanonicalSection =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'achievements'
  | 'certifications'
  | 'licenses'
  | 'publications'
  | 'languages'
  | 'hobbies'
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
    'professional skills',
    'relevant skills',
    'additional skills',
    'primary skills',
    'secondary skills',
    'it skills',
    'computer skills',
    'programming skills',
    'programming languages',
    'tools',
    'frameworks',
    'tech stack',
    'technology stack',
    'technical summary',
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
    'internships',
    'internship experience',
    'relevant work experience',
    'professional work history',
    'positions held',
    'career experience',
    'work',
    'professional history',
    'job history',
    'job experience',
    'apprenticeship', 'apprenticeships', 'practical experience', 'industrial training',
    'engagements', 'client engagements', 'project assignments', 'assignments',
  ],
  education: ['education', 'academics', 'academic background', 'education history', 'qualifications', 'quali cations', 'educational qualifications', 'academic qualifications', 'academic details', 'educational background', 'degrees', 'academic record', 'academic credentials', 'schooling', 'college education', 'university education', 'studies', 'educational details', 'academic experience'],
  projects: ['projects', 'notable projects', 'research', 'key projects', 'project experience', 'personal projects', 'side projects', 'portfolio', 'portfolio projects', 'academic projects', 'research projects', 'open source', 'open source contributions', 'contributions', 'selected projects'],
  /// Achievements / awards / honors are now their own section (the resume
  /// schema has a dedicated `achievements: string[]` field). Previously
  /// these headings were folded into projects, producing a phantom
  /// "Project" with the achievement text as bullets.
  achievements: ['achievements', 'accomplishments', 'key achievements', 'major achievements', 'awards', 'awards and achievements', 'achievements and awards', 'honors', 'honours', 'honors and awards', 'honours and awards', 'awards and honors', 'awards and honours', 'awards honors', 'awards honours', 'honors awards', 'achievements awards', 'awards achievements', 'recognitions', 'recognition', 'awards and recognition', 'awards and recognitions', 'awards recognition', 'achievements and recognition', 'achievements recognition', 'notable achievements', 'career highlights', 'highlights', 'key accomplishments'],
  certifications: [
    'certifications', 'certi cations', 'certificates',
    'professional certifications', 'pro essional certi cations',
    'training', 'training and certifications', 'courses',
    'professional development', 'continuing education',
    'credentials', 'professional credentials',
    'accreditations', 'professional training',
    'courses and certifications', 'certifications and training',
    'certifications and licenses',
    // Expanded — normalizer strips & and / to spaces, so the
    // following variants only differ in word order from the canonical
    // entries above but were previously missing.
    'certifications licenses',
    'certifications and licences',
    'certifications licences',
    'professional certifications and licenses',
    'professional certifications licenses',
    'certificates and licenses',
    'certificates licenses',
    'certifications training',
    'training certifications',
    'certs',
    'professional certificates',
    'badges',
    'qualifications and certifications',
  ],
  /// R-077 — licensure and publications are first-class resume sections
  /// now (schema fields `licenses` / `publications`), so their headings
  /// stop folding into certifications / projects.
  licenses: [
    'licenses', 'licences', 'license', 'licence', 'licensure',
    'registrations', 'registration', 'licenses and registrations',
    'registrations and licenses', 'licenses registrations', 'registrations licenses',
    'medical registration', 'medical registrations', 'medical licenses',
    'professional licenses', 'professional licensure', 'bar enrolment',
    'bar enrollment', 'state licenses',
  ],
  publications: [
    'publications', 'papers', 'research publications', 'publications and research',
    'research and publications', 'selected publications', 'journal publications',
    'conference papers', 'patents', 'publications and patents',
    'patents and publications', 'published works', 'academic publications',
  ],
  languages: [
    'languages', 'language proficiency', 'language skills', 'known languages',
    // Expanded — these were missing and explain the bug users
    // reported as "my languages section was never extracted".
    'languages known',
    'languages spoken',
    'spoken languages',
    'foreign languages',
    'linguistic skills',
    'language',
    'language knowledge',
    'languages and proficiency',
    'languages proficiency',
  ],
  hobbies: [
    'hobbies',
    'interests',
    'hobbies and interests',
    'hobbies interests',
    'personal interests',
    'activities',
    'extracurricular activities',
    'extra curricular activities',
    'volunteer experience',
    'volunteering',
    'volunteer work',
    'leisure',
    'pastimes',
    'innovation',
    'ai ml innovation',
    'ai innovation',
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

// Build KNOWN_HEADING_PHRASES from SECTION_SYNONYMS to stay in sync automatically,
// plus any additional phrases that should be recognized as headings.
const KNOWN_HEADING_PHRASES: Set<string> = (() => {
  const set = new Set<string>();
  for (const synonyms of Object.values(SECTION_SYNONYMS)) {
    for (const s of synonyms) set.add(s);
  }
  return set;
})();

function isHeadingLike(rawLine: string, normalized: string) {
  const raw = String(rawLine || '').trim();
  if (!raw || raw.length > 80) return false;
  if (/^[\-*•·]/.test(raw)) return false;
  // Lines containing sentence-ending punctuation are prose, not headings.
  // We used to have an escape hatch for KNOWN_HEADING_PHRASES here so that
  // "Skills:" / "Frameworks:" would still register — but the trailing-colon
  // case has its own explicit rule below, so the escape was never doing
  // anything useful for headings. What it WAS doing was letting orphan
  // soft-wrap continuations like "frameworks." (left behind when a long
  // bullet wraps across a line break) get treated as a SKILLS heading,
  // which silently shunted every following bullet into the wrong section.
  // Empirical breakage: Outspark-exported resume → the first bullet of an
  // experience entry wraps as "...defining reusable UI\nframeworks." and
  // every bullet after that orphan "frameworks." word landed under skills,
  // so the entry visibly lost ~6 bullets and its achievements list.
  if (/[.,;!?]/.test(raw) && !/:\s*$/.test(raw)) return false;
  if (/\d{2,}/.test(raw) && !/--\s*\d+\s*of\s*\d+\s*--/.test(raw)) return false;
  if (/:\s*$/.test(raw)) return true;

  // Check known heading phrases BEFORE rejecting lowercase-only lines.
  // (This is what lets "skills" / "education" register as headings even
  // when typeset without a colon — e.g. "Skills" on a line by itself.)
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
