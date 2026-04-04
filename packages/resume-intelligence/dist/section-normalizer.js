"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHeading = normalizeHeading;
const SECTION_SYNONYMS = {
    summary: ['summary', 'professional summary', 'pro essional summary', 'profile', 'profile summary', 'pro le summary', 'about', 'about me', 'objective', 'career summary', 'career objective', 'executive summary', 'personal statement', 'introduction', 'professional profile', 'career profile', 'personal profile', 'overview', 'professional overview', 'career overview', 'bio', 'brief', 'professional brief', 'who i am', 'highlight of qualifications', 'qualifications summary'],
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
        'abilities',
        'strengths',
        'core strengths',
        'key strengths',
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
        'professional positions',
    ],
    education: ['education', 'academics', 'academic background', 'education history', 'qualifications', 'quali cations', 'educational qualifications', 'academic qualifications', 'academic details', 'educational background', 'degrees', 'academic record', 'academic credentials', 'schooling', 'college education', 'university education', 'studies', 'educational details', 'academic experience'],
    projects: ['projects', 'notable projects', 'research', 'achievements', 'accomplishments', 'key projects', 'project experience', 'key achievements', 'personal projects', 'side projects', 'portfolio', 'portfolio projects', 'academic projects', 'research projects', 'open source', 'open source contributions', 'contributions', 'selected projects', 'major achievements', 'awards', 'awards and achievements', 'honors', 'honors and awards', 'publications', 'papers'],
    certifications: ['certifications', 'certi cations', 'licenses', 'certificates', 'professional certifications', 'pro essional certi cations', 'training', 'training and certifications', 'courses', 'professional development', 'continuing education', 'credentials', 'professional credentials', 'licensure', 'accreditations', 'professional training', 'courses and certifications', 'certifications and training', 'certifications and licenses'],
    languages: ['languages', 'language proficiency', 'language skills', 'known languages'],
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
function normalizeHeading(line) {
    const pageFooterHeading = line.match(/--\s*\d+\s*of\s*\d+\s*--\s*([a-z][a-z\s]+)$/i);
    if (pageFooterHeading && pageFooterHeading[1]) {
        const nested = normalizeHeading(pageFooterHeading[1]);
        if (nested)
            return nested;
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
    if (!normalized)
        return '';
    if (!isHeadingLike(line, normalized))
        return '';
    for (const [section, synonyms] of Object.entries(SECTION_SYNONYMS)) {
        if (synonyms.includes(normalized))
            return section;
    }
    return /:\s*$/.test(line) ? 'unmapped' : '';
}
// Build KNOWN_HEADING_PHRASES from SECTION_SYNONYMS to stay in sync automatically,
// plus any additional phrases that should be recognized as headings.
const KNOWN_HEADING_PHRASES = (() => {
    const set = new Set();
    for (const synonyms of Object.values(SECTION_SYNONYMS)) {
        for (const s of synonyms)
            set.add(s);
    }
    return set;
})();
function isHeadingLike(rawLine, normalized) {
    const raw = String(rawLine || '').trim();
    if (!raw || raw.length > 80)
        return false;
    if (/^[\-*•·]/.test(raw))
        return false;
    if (/[.,;!?]/.test(raw) && !/:\s*$/.test(raw) && !KNOWN_HEADING_PHRASES.has(normalized))
        return false;
    if (/\d{2,}/.test(raw) && !/--\s*\d+\s*of\s*\d+\s*--/.test(raw))
        return false;
    if (/:\s*$/.test(raw))
        return true;
    // Check known heading phrases BEFORE rejecting lowercase-only lines
    if (KNOWN_HEADING_PHRASES.has(normalized))
        return true;
    // ALL CAPS lines that match a known pattern are headings
    if (/^[A-Z\s&/]+$/.test(raw) && raw.length <= 40 && KNOWN_HEADING_PHRASES.has(normalized))
        return true;
    if (/^[a-z\s]+$/.test(raw))
        return false;
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length)
        return false;
    const headingWords = words.filter((word) => /^[A-Z][A-Za-z0-9&'()./-]*$/.test(word) || /^[A-Z]{2,}$/.test(word));
    if (headingWords.length >= Math.ceil(words.length * 0.6))
        return true;
    return false;
}
