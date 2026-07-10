import type {
  CertificationItem,
  Contact,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ParsedResume,
} from 'resume-schemas';
import { ParsedResumeSchema } from 'resume-schemas';
import type { ParsedResumeText } from './resume-parser.js';
import { parseResumeText } from './resume-parser.js';
import { computeExperienceLevel } from './experience-level.js';
import { normalizeHeading } from './section-normalizer.js';
import { enhanceExperienceExtraction } from './experience-enhancer.js';
import { ADDITIONAL_TECH_SKILLS, hardenString } from './extraction-enhancements.js';
import { getExtractionConfig } from './extraction-config.js';
import { detectLayout, deinterleaveColumns } from './layout-detector.js';
import { runDeduplicationPipeline } from './deduplication-engine.js';
import { pickBetterExtraction, verifyExtraction } from './extraction-verifier.js';

export type MappedResumeResult = ParsedResume & {
  signals: {
    roleCount: number;
    distinctCompanyCount: number;
    rolesWithDateCount: number;
    roleCompanyPatternCount: number;
    estimatedTotalMonths: number;
  };
};

const ROLE_HINT_RE = /\b(engineer|developer|manager|designer|analyst|intern|lead|architect|specialist|consultant|director|head|officer|administrator|coordinator|principal|staff|qa|devops|product|owner|founder|avp|assistant vice president|vice president|scientist|researcher|professor|instructor|trainer|executive|president|cto|ceo|cfo|coo|cio|vp|svp|evp|partner|fellow|technologist|programmer|tester|strategist|planner|advisor|auditor|accountant|recruiter|editor|writer|nurse|physician|therapist|pharmacist|attorney|paralegal|clerk|secretary|receptionist|assistant|supervisor|foreman|mechanic|technician|operator|dispatcher|pilot|captain|chef|baker|bartender|waiter|teacher)\b/i;
// "Associate" is ambiguous — it can mean a job role ("Associate Engineer") or an education degree ("Associate of Science").
// Only match "associate" as a role when NOT followed by "of" or "degree".
const ASSOCIATE_ROLE_RE = /\bassociate\b(?!\s+(?:of|degree))/i;
const PLACEHOLDER_ONLY_RE = /^(?:-|n\/a|na|null|none|not available)$/i;
const TITLE_BLOCKLIST = new Set([
  'skills',
  'soft skills',
  'technical skills',
  'work experience',
  'experience',
  'professional experience',
  'employment',
  'employment history',
  'work history',
  'education',
  'professional summary',
  'summary',
  'communication',
  'teamwork',
  'leadership',
  'problem solving',
  'problem-solving',
  'languages',
  'achievements',
]);
const CONTACT_LABEL_RE = /\b(email|mobile|phone|contact|linkedin|github|portfolio|address|location)\b/i;
// Used to prevent section heading words from being mistaken for a person's name.
// NOTE: soft-skill words (communication, leadership, teamwork, problem-solving) are
// intentionally NOT blocked here — they are legitimate skill tokens extracted from
// the sidebar skills sections of two-column resumes.
const NAME_BLOCKLIST_RE = /\b(skills?|technical|soft|experience|employment|education|languages|achievements?|summary|profile|objective)\b/i;
const COMPANY_SUFFIX_RE = /\b(inc|llc|ltd|corp|company|technologies|systems|labs|solutions|group|studio|partners|bank|consulting|digital)\b/i;
// Skill subsection labels (e.g. "Soft Skills:", "Technical Skills - ...") are never company names.
// PDF extractors sometimes strip the parent SKILLS heading or break sublabels onto their own line,
// causing these tokens to leak into experience extraction.
const SKILL_SUBSECTION_LABEL_RE = /^\s*(?:soft|technical|hard|core|key|professional|relevant|additional|primary|secondary|computer|programming|functional|domain|business|interpersonal|transferable|cloud|devops|data|ai|ml|management)\s+(?:skills?|competencies|expertise|proficiencies|tools?|technologies)\b\s*[:\-—–]?/i;
// Lines that open with a sentence-style verb / past participle / connector are
// descriptions or bullets, never company names. Used as an additional guard in
// looksLikeCompany() / looksLikeRoleTitle() so that prose like "ensuring
// alignment with company" or "Built scalable distributed systems" does not
// pass detection just because it incidentally contains a company-suffix
// word or role hint.
//
// Listed verbs are explicit — a broad pattern like `[A-Z][a-z]+ing` would
// wrongly reject nouns ("Engineering Manager", "Marketing Director", etc.).
const SENTENCE_OPENER_RE = /^(?:As\s|Led\s|Built\s|Drove\s|Designed\s|Developed\s|Improved\s|Owned\s|Managed\s|Delivered\s|Implemented\s|Architected\s|Created\s|Worked\s|Authored\s|Spearheaded\s|Mentored\s|Coordinated\s|Collaborated\s|Conducted\s|Contributed\s|Defined\s|Engineered\s|Enhanced\s|Facilitated\s|Generated\s|Guided\s|Headed\s|Initiated\s|Integrated\s|Introduced\s|Maintained\s|Optimized\s|Orchestrated\s|Organized\s|Participated\s|Performed\s|Pioneered\s|Planned\s|Practiced\s|Provided\s|Reduced\s|Refactored\s|Researched\s|Resolved\s|Reviewed\s|Streamlined\s|Supervised\s|Supported\s|Tested\s|Trained\s|Utilized\s|Acted\s|Achieved\s|Applied\s|Assisted\s|Analyzed\s|Innovated\s|Hindson\s|Incorporated\s|Played\s|Recognized\s|Received\s|Successfully\s|Championed\s|Cultivated\s|Demonstrated\s|Engaged\s|Exploring\s|Showcase\s|Fostered\s|Functioned\s|Hands-?on\s|Oversaw\s|Utilised\s|Spearheading\s|Driving\s|Ensuring\s|Promoting\s|Leveraged\s)/;
const HEADLINE_FRAGMENT_RE = /\b(system design|software design|web development|frontend|backend|full stack|machine learning|data science|cloud computing|devops|product management|project management|artificial intelligence|digital marketing|user experience|user interface|mobile development|database|networking|cybersecurity|blockchain|deep learning)\b/i;
const LEGACY_BULLET_PREFIX_RE = /^\s*(?:[-*•·]+|\d{1,3}[.)]|[a-z][.)])?\s*(impact|achievement|result|highlights?|accomplishment)s?:\s*/i;

type HeaderMapping = {
  contact?: Contact;
  fullName: string;
  headline: string;
};

export function mapParsedResume(parsed: ParsedResumeText): MappedResumeResult {
  const config = getExtractionConfig();

  // Phase 2: Layout detection — detect multi-column resumes and re-order if needed
  let effectiveParsed = parsed;
  if (config.layoutDetection) {
    const rawText = parsed.lines.join('\n');
    const layout = detectLayout(rawText);
    if (layout.type !== 'single-column' && layout.columnWiseExtraction) {
      // Re-order interleaved text and re-parse
      const reordered = deinterleaveColumns(rawText, layout);
      if (reordered !== rawText) {
        effectiveParsed = parseResumeText(reordered);
      }
    }
  }

  const summary = mapSummary(effectiveParsed.sections);
  const skillsRaw = mapSkills(effectiveParsed.sections);
  const experienceRaw = sortExperienceChronological(
    mergeExperienceByCompany(mapExperience(effectiveParsed)),
  );
  const educationRaw = mapEducation(effectiveParsed.sections);
  const projects = mapProjects(effectiveParsed.sections);
  const certifications = mapCertifications(effectiveParsed.sections);
  const licenses = mapLicenses(effectiveParsed.sections);
  const publications = mapPublications(effectiveParsed.sections);
  const achievements = mapAchievements(effectiveParsed.sections);
  const header = mapHeader(effectiveParsed.lines);
  const contact = header.contact;
  const title = guessTitle(effectiveParsed.lines, header);
  const mappedUnsorted = getUnmappedText(effectiveParsed.sections);
  const experienceSanitized = sanitizeExperienceForStrictSave(experienceRaw);
  const educationSanitized = sanitizeEducationForStrictSave(educationRaw);
  const shouldEnhanceExperience = experienceSanitized.items.length < 1
    || experienceSanitized.items.some((item) => !item.company || !item.role);
  const experienceAfterEnhancement = shouldEnhanceExperience
    ? enhanceExperienceExtraction({
      rawText: effectiveParsed.lines.join('\n'),
      parsed: effectiveParsed,
      currentExperience: experienceSanitized.items,
    })
    : experienceSanitized.items;
  const finalExperienceSanitized = shouldEnhanceExperience
    ? sanitizeExperienceForStrictSave(experienceAfterEnhancement)
    : experienceSanitized;

  // Phase 2: Enhanced multi-layer deduplication
  let finalSkills = skillsRaw;
  let finalExperience = finalExperienceSanitized.items;
  if (config.enhancedDedup) {
    const dedupResult = runDeduplicationPipeline({
      skills: skillsRaw,
      experience: finalExperienceSanitized.items,
      highlights: finalExperienceSanitized.items.flatMap((e) => e.highlights),
    });
    finalSkills = dedupResult.skills;
    finalExperience = dedupResult.experience;
  }

  // Verification safety-net: compare the structured fields against the raw
  // text and, when confidence is poor, attempt a second-pass extraction via
  // the enhancer.  We only accept the alternative if it scores higher than
  // the primary — this way we minimise the risk of dropping a working
  // extraction in favour of a worse one.
  const rawText = effectiveParsed.lines.join('\n');
  const primaryReport = verifyExtraction(rawText, {
    contact,
    experience: finalExperience,
    education: educationSanitized.items,
    skills: finalSkills,
  });
  if (primaryReport.shouldReExtract && !shouldEnhanceExperience) {
    const fallbackExperience = enhanceExperienceExtraction({
      rawText,
      parsed: effectiveParsed,
      currentExperience: finalExperience,
    });
    const fallbackSanitized = sanitizeExperienceForStrictSave(fallbackExperience).items;
    if (fallbackSanitized.length) {
      const fallbackReport = verifyExtraction(rawText, {
        contact,
        experience: fallbackSanitized,
        education: educationSanitized.items,
        skills: finalSkills,
      });
      const chosen = pickBetterExtraction(
        { contact, experience: finalExperience, education: educationSanitized.items, skills: finalSkills },
        { contact, experience: fallbackSanitized, education: educationSanitized.items, skills: finalSkills },
        primaryReport,
        fallbackReport,
      );
      if (chosen.usedAlternative) {
        finalExperience = fallbackSanitized;
      }
    }
  }

  const unmappedText = mergeUnmappedText(
    mappedUnsorted,
    [...finalExperienceSanitized.rejected, ...educationSanitized.rejected],
  );
  const resumeText = [
    summary,
    finalSkills.join(' '),
    finalExperience.map((item) => `${item.role} ${item.company}`).join(' '),
  ].join(' ');
  const levelResult = computeExperienceLevel({ resumeText, experience: finalExperience });

  const languages = mapLanguages(effectiveParsed.sections);

  // Inline-fallback scan: when a DEDICATED section is empty, look for
  // mentions inside the experience bullets / summary so a resume that
  // says "Speaks English and Hindi" inside a bullet still surfaces
  // those languages, and "AWS Certified Solutions Architect" inside
  // a bullet still surfaces as a certification. The existing
  // dedicated-section mappers are unchanged; this only fires when
  // those mappers returned zero results.
  const inlineBullets: string[] = [
    summary,
    ...finalExperience.flatMap((it) => it.highlights || []),
    ...(effectiveParsed.sections.unmapped || []),
    // Also scan content the section-normaliser routed to OTHER
    // optional sections, so e.g. a "Certifications: Azure Developer
    // Associate (2025)" line that fell into the Achievements section
    // (because the heading detector treats it as a content line, not
    // a section break) still surfaces as a certification. The same
    // for project bullets that name an award.
    ...(effectiveParsed.sections.achievements || []),
    ...(effectiveParsed.sections.projects || []),
  ].filter((s) => typeof s === 'string' && s.length > 0);

  const languagesAugmented = languages.length
    ? languages
    : extractInlineLanguages(inlineBullets);
  const certificationsAugmented = certifications.length
    ? certifications
    : extractInlineCertifications(inlineBullets);
  const achievementsAugmented = achievements.length
    ? achievements
    : extractInlineAchievements(inlineBullets);

  const validated = ParsedResumeSchema.parse({
    title,
    contact,
    summary,
    skills: finalSkills,
    languages: languagesAugmented,
    experience: finalExperience,
    education: educationSanitized.items,
    projects,
    certifications: certificationsAugmented,
    achievements: achievementsAugmented,
    licenses,
    publications,
    unmappedText: unmappedText || undefined,
    roleLevel: levelResult.level,
  });

  return {
    ...validated,
    signals: levelResult.signals,
  };
}

function mapSummary(sections: Record<string, string[]>) {
  const lines = [
    ...(sections.summary || []),
    ...(sections.profile || []),
    ...(sections.objective || []),
  ];
  // When the SUMMARY/PROFILE/OBJECTIVE heading exists but its body landed
  // elsewhere (multi-column PDFs that cluster headings at the top leave the
  // section empty), recover the professional-summary paragraph from wherever
  // it leaked before falling back to the first unmapped lines — otherwise the
  // fallback returns the name line as the "summary".
  if (!lines.length) {
    const recovered = recoverLeakedSummary(sections);
    if (recovered) return recovered;
  }
  const fallback = lines.length
    ? lines
    // Don't let the name / a contact line become the summary.
    : (sections.unmapped || []).filter((l) => !isNameOrContactLine(l)).slice(0, 2);
  const raw = fallback
    .map((line) => line.replace(/^\s*[-•*·]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (raw.length <= 600) return raw;
  // Truncate at word boundary to avoid cutting mid-word
  const truncated = raw.slice(0, 600);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 400 ? truncated.slice(0, lastSpace).trim() : truncated.trim();
}

/** A short line that is just the candidate's name or a contact line. */
function isNameOrContactLine(line: string) {
  const t = cleanLooseText(line);
  if (!t) return true;
  if (/@|\b\d{7,}\b|linkedin|github|portfolio/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  // 1–4 word ALL-CAPS or Title-Case line with no sentence punctuation → a name.
  if (words.length <= 4 && !/[.;:]/.test(t) && /^[A-Z][A-Za-z.'-]*(\s+[A-Z][A-Za-z.'-]*)*$/.test(t)) return true;
  return false;
}

/**
 * Recover a professional-summary paragraph that was mis-filed into another
 * section by a scrambled multi-column PDF. Conservative on purpose: it only
 * fires when a line both opens like a summary AND carries an explicit
 * experience signal ("X years of experience" / "experience in"), then gathers
 * the contiguous prose that follows it.
 */
function recoverLeakedSummary(sections: Record<string, string[]>): string {
  const EXPERIENCE_SIGNAL = /\byears?\s+of\s+experience\b|\bexperience\s+in\b/i;
  const SUMMARY_OPENER = /^(results?-driven|experienced|dedicated|accomplished|passionate|motivated|detail-oriented|highly|seasoned|proven|innovative|dynamic|self-motivated|skilled|professional|software|frontend|backend|full[- ]?stack|senior|lead|aspiring|technical)\b/i;
  const skip = new Set(['skills', 'technical', 'core', 'technologies', 'languages', 'summary', 'profile', 'objective']);
  for (const [key, vals] of Object.entries(sections)) {
    if (skip.has(key) || !Array.isArray(vals)) continue;
    for (let i = 0; i < vals.length; i += 1) {
      const line = cleanLooseText(vals[i]);
      if (!line || !EXPERIENCE_SIGNAL.test(line) || !SUMMARY_OPENER.test(line)) continue;
      const para: string[] = [];
      for (let j = i; j < vals.length && para.length < 12; j += 1) {
        const l = cleanLooseText(vals[j]);
        if (!l) break;
        if (isDateLine(l) || normalizeHeading(vals[j]) || /@|\b\d{7,}\b/.test(l)
          || extractBulletLine(vals[j]) || looksLikeEducationDegreeLine(l)) break;
        para.push(l);
      }
      if (para.length) return para.join(' ').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

const HUMAN_LANGUAGES = new Set([
  'english', 'hindi', 'spanish', 'french', 'german', 'italian', 'portuguese',
  'chinese', 'mandarin', 'cantonese', 'japanese', 'korean', 'arabic', 'russian',
  'dutch', 'swedish', 'norwegian', 'danish', 'finnish', 'polish', 'turkish',
  'thai', 'vietnamese', 'indonesian', 'malay', 'tagalog', 'tamil', 'telugu',
  'kannada', 'malayalam', 'bengali', 'gujarati', 'marathi', 'punjabi', 'urdu',
  'nepali', 'sinhalese', 'burmese', 'khmer', 'lao', 'greek', 'hebrew',
  'persian', 'farsi', 'swahili', 'amharic', 'yoruba', 'igbo', 'hausa',
  'zulu', 'afrikaans', 'romanian', 'hungarian', 'czech', 'slovak', 'croatian',
  'serbian', 'bulgarian', 'ukrainian', 'catalan', 'galician', 'basque',
  'esperanto', 'latin', 'sanskrit',
  // Additional Indian + regional languages commonly listed on resumes.
  'konkani', 'bhojpuri', 'assamese', 'odia', 'oriya', 'maithili', 'sindhi',
  'kashmiri', 'dogri', 'manipuri', 'santali', 'tulu', 'rajasthani',
  'haryanvi', 'magahi', 'chhattisgarhi', 'mizo', 'khasi', 'pashto', 'dari',
]);

function mapSkills(sections: Record<string, string[]>) {
  const lines = [
    ...(sections.skills || []),
    ...(sections.technical || []),
    ...(sections.core || []),
    ...(sections.technologies || []),
  ];
  // Two-column sidebar resumes often list one skill per line with no delimiter.
  // When the majority of non-empty lines are short and delimiter-free, treat
  // each line as a single skill rather than splitting on delimiters.
  const mostAreSingleItems = lines.length > 2
    && lines.filter((l) => l.length < 35 && !/[,;|]/.test(l)).length / lines.length > 0.65;
  const tokens = lines
    .flatMap((line) => {
      // Remove common leading labels like "Skills:", "Technical Skills:", etc.
      // Additive: also strip category sub-labels that resumes prefix to a
      // skill group ("Frontend: HTML, CSS", "Databases: MySQL") so the first
      // token doesn't become "Frontend: HTML".
      const cleaned = line.replace(/^(?:skills?|technical\s+skills?|soft\s+skills?|core\s+skills?|key\s+skills?|technologies)\s*:?\s*/i, '')
        .replace(/^(?:frontend|front-end|backend|back-end|full[\s-]?stack|languages?|frameworks?|libraries|library|databases?|tools?|cloud|devops|testing|platforms?|methodologies|technologies|programming(?:\s+languages?)?|web|mobile|design|analytics|ml\/?ai|ai\/?ml)\s*:\s*/i, '')
        .replace(/^[-*\u2022\u25e6\u25aa\u25cf\u25cb]\s*/, '');
      if (mostAreSingleItems) {
        const parts = cleaned.split(/,|;|\|/);
        return parts.length > 1 ? parts : [cleaned];
      }
      // Split on common delimiters: comma, semicolon, pipe, bullet, middot
      return cleaned.split(/,|;|\||\u00b7|\u2022|\u25e6|\u25aa|\u25cf|â€¢|Â·/);
    })
    .map((token) => cleanLooseText(token))
    .filter((token) => {
      if (token.length < 2 || token.length > 50) return false;
      const words = token.split(/\s+/).filter(Boolean);
      if (words.length > 4) return false;
      if (/^(and|or|in|on|with|for|to|of|the)$/i.test(words[0] || '')) return false;
      if (/[!?]/.test(token)) return false;
      // Reject sentence-ending periods but allow tech names like "Node.js", "ASP.NET", "Vue.js"
      if (/\.\s/.test(token) || /\.$/.test(token)) return false;
      if (/@|https?:\/\/|www\./i.test(token)) return false;
      if (CONTACT_LABEL_RE.test(token)) return false;
      if (NAME_BLOCKLIST_RE.test(token)) return false;
      if (isLikelyNameLine(token)) return false;
      if (ROLE_HINT_RE.test(token) && token.split(/\s+/).length >= 3) return false;
      if (/^\#/.test(token)) return false;
      if (/\b\d+\s+of\s+\d+\b/i.test(token)) return false;
      if (/\d{3,}/.test(token)) return false;
      // Filter out human language names (e.g. English, Hindi) that belong in Languages section
      if (HUMAN_LANGUAGES.has(token.toLowerCase())) return false;
      return /[a-z]/i.test(token);
    });
  // If dedicated skills section yielded very few results, supplement from summary & experience
  if (tokens.length < 5) {
    const contextLines = [
      ...(sections.summary || []),
      ...(sections.profile || []),
      ...(sections.experience || []),
    ];
    const contextText = contextLines.join(' ');
    const extracted = extractTechSkillsFromText(contextText);
    const existing = new Set(tokens.map((t) => t.toLowerCase()));
    for (const skill of extracted) {
      if (!existing.has(skill.toLowerCase())) {
        tokens.push(skill);
        existing.add(skill.toLowerCase());
      }
    }
  }
  return Array.from(new Set(tokens)).slice(0, 30);
}

function mapLanguages(sections: Record<string, string[]>): string[] {
  const lines = sections.languages || [];
  if (!lines.length) return [];
  const tokens = lines
    .flatMap((line) => line.replace(/^languages?\s*:?\s*/i, '').split(/,|;|\||·|•/))
    .map((t) => cleanLooseText(t))
    .filter((t) =>
      // Length and "must contain a letter" stay the same, plus:
      //   - reject tokens containing watermark / template characters
      //     (#, @, /, \, etc.) — caught the "#CreatedByOutspark#" leak
      //     a PDF template was injecting into the Languages section.
      //   - reject CamelCase compound tokens like "CreatedByOutspark"
      //     (4+ uppercase letters with no spacing) — real language
      //     names are either single words or simple word pairs.
      //   - reject obvious page-footer / divider markers like
      //     "-- 4 of 4 --".
      t.length >= 2 && t.length <= 40
      && !/^\d+$/.test(t)
      && /[a-z]/i.test(t)
      && !/[#@\/\\*<>{}\[\]]/.test(t)
      && !/^-{2,}/.test(t)
      && !/^[A-Z][a-z]+[A-Z][a-z]+[A-Z]/.test(t),
    )
    // Backstop: a dedicated Languages section must contain real language
    // names. Keep a token only if its first word is a recognised human
    // language (allows "English (Professional)", "Hindi - Native"). This
    // rejects watermark fragments (CONFIDENTIAL/ENTIAL) or stray header
    // words that leak into the section. Custom languages can still be
    // added manually in the editor.
    .filter((t) => {
      const firstWord = (t.match(/[A-Za-z]+/)?.[0] || '').toLowerCase();
      return HUMAN_LANGUAGES.has(firstWord);
    });
  return Array.from(new Set(tokens)).slice(0, 10);
}

const KNOWN_TECH_SKILLS = [
  'React', 'ReactJS', 'React.js', 'Angular', 'AngularJS', 'Vue', 'Vue.js', 'VueJS',
  'Node.js', 'NodeJS', 'Express', 'Express.js', 'NestJS', 'Next.js', 'NextJS',
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'Go', 'Golang', 'Rust', 'Ruby',
  'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'Perl', 'Dart',
  'HTML5?', 'CSS3?', 'SASS', 'SCSS', 'Less', 'Tailwind', 'Bootstrap',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch', 'DynamoDB', 'Cassandra',
  'SQL', 'NoSQL', 'GraphQL', 'REST', 'RESTful',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'K8s', 'Terraform',
  'Jenkins', 'CI/CD', 'Git', 'GitHub', 'GitLab', 'Bitbucket',
  'Redux', 'MobX', 'Zustand', 'Context API',
  'Spring Boot', 'Spring', 'Django', 'Flask', 'FastAPI', 'Rails',
  'Webpack', 'Vite', 'Babel', 'ESLint', 'Prettier',
  'Jest', 'Mocha', 'Cypress', 'Selenium', 'Playwright',
  'Figma', 'Sketch', 'Adobe XD',
  'Agile', 'Scrum', 'Kanban', 'JIRA', 'Confluence',
  'Microservices', 'Serverless', 'DevOps', 'Linux',
  'D3', 'D3.js', 'Three.js', 'jQuery', 'Polymer', 'PolymerJS',
  'Kafka', 'RabbitMQ', 'gRPC', 'WebSocket',
  'TDD', 'BDD', 'OOP', 'MVC', 'MVVM',
  'Sass', 'Material UI', 'Ant Design', 'Chakra UI',
  ...ADDITIONAL_TECH_SKILLS,
];

function extractTechSkillsFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const skill of KNOWN_TECH_SKILLS) {
    const pattern = new RegExp(`\\b${skill}\\b`, 'gi');
    const match = text.match(pattern);
    if (match) {
      const normalized = match[0];
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push(normalized);
      }
    }
  }
  return found;
}

function mapExperience(parsed: ParsedResumeText) {
  const source = buildExperienceSource(parsed);
  const blocks: ExperienceItem[] = [];
  let current: ExperienceItem | null = null;
  let currentCompany = '';
  let pendingRole = '';
  let pendingStartDate = '';
  let pendingEndDate = '';
  const pendingDateBlockIndexes: number[] = [];

  // Keep role/company/date grouping stable while preserving multiple roles under one company.
  const pushCurrent = () => {
    if (!current) return;
    current.company = cleanCompanyName(current.company);
    current.role = cleanLooseText(current.role);
    current.startDate = normalizeDateToken(cleanLooseText(current.startDate));
    current.endDate = normalizeDateToken(cleanLooseText(current.endDate));
    current.highlights = mergeWrappedHighlights(
      uniqueLines(current.highlights.map((line: string) => cleanLooseText(line)).filter(Boolean)),
    );
    if (current.company) currentCompany = current.company;
    if (isMeaningfulExperience(current)) {
      blocks.push(current);
      if (current.company.trim() && current.role.trim() && !current.startDate && !current.endDate) {
        pendingDateBlockIndexes.push(blocks.length - 1);
      }
    }
    current = null;
  };

  const startCurrent = (seed: { company?: string; role?: string; startDate?: string; endDate?: string }) => {
    pushCurrent();
    const company = cleanCompanyName(seed.company || currentCompany);
    const role = cleanLooseText(seed.role || '');
    const startDate = normalizeDateToken(cleanLooseText(seed.startDate || ''));
    const endDate = normalizeDateToken(cleanLooseText(seed.endDate || ''));
    if (company) currentCompany = company;
    current = { company, role, startDate, endDate, highlights: [] };
    pendingRole = '';
    pendingStartDate = '';
    pendingEndDate = '';
  };

  const assignDatesToCurrentOrRecent = (startDate: string, endDate: string) => {
    if (!startDate && !endDate) return;
    while (pendingDateBlockIndexes.length) {
      const nextIndex = pendingDateBlockIndexes[0];
      const item = blocks[nextIndex];
      if (!item || item.startDate || item.endDate) {
        pendingDateBlockIndexes.shift();
        continue;
      }
      item.startDate = startDate || item.startDate;
      item.endDate = endDate || item.endDate;
      pendingDateBlockIndexes.shift();
      return;
    }
    if (current && (current.company.trim() || current.role.trim()) && !current.startDate && !current.endDate) {
      current.startDate = startDate;
      current.endDate = endDate;
      return;
    }
  };

  const appendBulletToNearestBlock = (bullet: string) => {
    if (current) {
      // A PDF often wraps one logical bullet across several lines; when the
      // wrapped tail also carries a bullet glyph it would otherwise become its
      // own fragment ("...improving runtime" / "performance and stability...").
      // Re-join it into the previous highlight so each field holds a complete
      // sentence instead of a meaningless fragment.
      const last = current.highlights[current.highlights.length - 1];
      if (last && shouldMergeWrappedLine(last, bullet)) {
        current.highlights[current.highlights.length - 1] = `${last.trimEnd()} ${bullet.trimStart()}`;
      } else {
        current.highlights.push(bullet);
      }
      return true;
    }
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const item = blocks[i];
      if (currentCompany && normalizeCompany(item.company) !== normalizeCompany(currentCompany)) {
        continue;
      }
      const last = item.highlights[item.highlights.length - 1];
      if (last && shouldMergeWrappedLine(last, bullet)) {
        item.highlights = [...item.highlights.slice(0, -1), `${last.trimEnd()} ${bullet.trimStart()}`];
      } else {
        item.highlights = uniqueLines([...item.highlights, bullet]);
      }
      return true;
    }
    return false;
  };

  for (const rawLine of source) {
    const normalizedSourceLine = normalizeLegacyBulletPrefix(rawLine);
    const normalizedLine = cleanLooseText(normalizedSourceLine);
    if (!normalizedLine) continue;
    const heading = normalizeHeading(normalizedSourceLine);
    if (heading && heading !== 'experience') {
      pushCurrent();
      break; // Stop processing — we've left the experience section
    }

    if (isCrossSectionBoundary(normalizedSourceLine)) {
      if (isDateLine(normalizedLine)) {
        const dates = extractDates(normalizedLine);
        assignDatesToCurrentOrRecent(dates.start, dates.end);
      }
      pushCurrent();
      continue;
    }

    // Skip “Technologies - ...” or “Technologies: ...” lines — treat as highlights, not company/role
    if (/^Technologies\s*[-:]/i.test(normalizedLine)) {
      if (current) {
        current.highlights.push(normalizedLine);
      }
      continue;
    }

    // "Project: <name> | <client>" lines are project sub-headings inside a job
    // entry, not company/role headers. Without this guard the "<client>" half
    // (e.g. "AT&T Inc.") gets mis-detected as the company and overwrites the
    // real one. Keep the line as a highlight so the project context survives.
    if (/^Projects?\s*[-:]/i.test(normalizedLine)) {
      if (current) current.highlights.push(normalizedLine);
      continue;
    }

    // "Role - <functional role> <location>" / "Role: <functional role>" lines
    // restate the role and append a location; they are NOT a new job header.
    // Treat as the role for the current entry when it lacks one, otherwise
    // skip so they don't spawn a phantom "Role - …" company entry.
    const roleLabelMatch = normalizedLine.match(/^Role\s*[-:]\s*(.+)$/i);
    if (roleLabelMatch) {
      if (current && !current.role) {
        const roleText = cleanLooseText(roleLabelMatch[1].replace(/\s{2,}.*$/, ''));
        if (roleText && looksLikeRole(roleText)) current.role = roleText;
      }
      continue;
    }

    // Skip skill subsection labels (“Soft Skills:”, “Technical Skills - ...”) — these can
    // bleed into experience source when PDF section detection is partial and otherwise
    // get mis-classified as company names because of their title-case shape.
    if (SKILL_SUBSECTION_LABEL_RE.test(normalizedLine)) {
      continue;
    }

    const bullet = extractBulletLine(normalizedSourceLine);
    if (bullet) {
      if (pendingRole && currentCompany && !current) {
        startCurrent({ company: currentCompany, role: pendingRole, startDate: pendingStartDate, endDate: pendingEndDate });
      }
      if (!appendBulletToNearestBlock(bullet)) {
        current = { company: cleanCompanyName(currentCompany), role: '', startDate: '', endDate: '', highlights: [bullet] };
      }
      continue;
    }

    if (isStandaloneDateLine(normalizedLine)) {
      if (pendingRole && !current) {
        // Don't start entry yet — the company line typically follows the date.
        // Store dates as pending so they can be used when the company is found.
        const dates = extractDates(normalizedLine);
        pendingStartDate = dates.start;
        pendingEndDate = dates.end;
      } else {
        const dates = extractDates(normalizedLine);
        assignDatesToCurrentOrRecent(dates.start, dates.end);
      }
      continue;
    }

    // Handle “Role DateRange” pattern — e.g. “AVP Dec 2022 - Present”, “Senior Engineer Jan 2020 - Dec 2022”
    // The line has a date range AND contains a role hint, but the role is the non-date part.
    // Only match when the non-date part is a standalone role (no @ | “at” or
    // dash/em-dash company separator). The dash check applies to the role
    // portion after dates have been stripped — otherwise the date range itself
    // (e.g. "Jan 2022 - Present") would suppress every legitimate Role+Date line.
    if (isDateLine(normalizedLine) && !isStandaloneDateLine(normalizedLine) &&
      !/@|\sat\s|\|/i.test(normalizedLine)) {
      const strippedRole = cleanLooseText(stripDates(normalizedLine));
      // If the stripped role still contains a delimiter, the line is really
      // "Role - Company - Date" or similar; let parseExperienceHeader handle it.
      // A bare "|" (even without surrounding spaces) is a company/role
      // separator, so treat it as an inner separator too.
      const hasInnerSeparator = /\s-\s|\s—\s|\s–\s|\||@|\sat\s/i.test(strippedRole);
      if (!hasInnerSeparator && strippedRole && looksLikeRole(strippedRole) && looksLikeRoleTitle(strippedRole) &&
        !looksLikeCompany(strippedRole) && !looksLikeEducationRoleLine(strippedRole) &&
        strippedRole.split(/\s+/).length <= 6) {
        const dates = extractDates(normalizedLine);
        if (current) pushCurrent();
        if (pendingRole && (pendingStartDate || pendingEndDate)) {
          startCurrent({ company: currentCompany, role: pendingRole, startDate: pendingStartDate, endDate: pendingEndDate });
          pushCurrent();
        }
        pendingRole = strippedRole;
        pendingStartDate = dates.start;
        pendingEndDate = dates.end;
        continue;
      }
    }

    if (
      looksLikeRole(normalizedLine) &&
      looksLikeRoleTitle(normalizedLine) &&
      !looksLikeCompany(normalizedLine) &&
      !looksLikeEducationRoleLine(normalizedLine) &&
      !isDateLine(normalizedLine) &&
      !/@|\sat\s|\s\|\s|\s-\s|\s—\s|\s–\s|â€”|â€”/i.test(normalizedLine)
    ) {
      if (current) pushCurrent();
      // If there was a previous pending role with dates but no company found,
      // flush it as an entry with the last-known company before setting the new role.
      if (pendingRole && (pendingStartDate || pendingEndDate)) {
        startCurrent({ company: currentCompany, role: pendingRole, startDate: pendingStartDate, endDate: pendingEndDate });
        pushCurrent();
      }
      pendingRole = normalizedLine;
      continue;
    }

    // Detect bare "Company DateRange" pattern (no parens) — common in docx
    // exports where the column structure renders as a tab- or space-separated
    // "Company\tDate" line, e.g. "Citi Dec 2013 - Present" or "Cognizant 2011 - 2013".
    const companyBareDate = parseCompanyDateLine(normalizedLine);
    if (companyBareDate) {
      if (pendingRole) {
        startCurrent({
          company: companyBareDate.company,
          role: pendingRole,
          startDate: companyBareDate.startDate || pendingStartDate,
          endDate: companyBareDate.endDate || pendingEndDate,
        });
        continue;
      }
      if (current && current.company && current.role && normalizeCompany(current.company) !== normalizeCompany(companyBareDate.company)) {
        pushCurrent();
      }
      currentCompany = companyBareDate.company;
      if (current && !current.company) current.company = companyBareDate.company;
      if (current && !current.startDate && companyBareDate.startDate) {
        current.startDate = companyBareDate.startDate;
        current.endDate = companyBareDate.endDate;
      }
      continue;
    }

    // Detect "Company (Location) (DateRange)" pattern — common in ATS-exported PDFs
    // e.g. "Citi Corp (Pune, India) (Dec 2022 - Present)"
    const companyLocDate = parseCompanyLocationDateLine(normalizedLine);
    if (companyLocDate) {
      if (pendingRole) {
        startCurrent({
          company: companyLocDate.company,
          role: pendingRole,
          startDate: companyLocDate.startDate || pendingStartDate,
          endDate: companyLocDate.endDate || pendingEndDate,
        });
        continue;
      }
      if (current && current.company && current.role && normalizeCompany(current.company) !== normalizeCompany(companyLocDate.company)) {
        pushCurrent();
      }
      currentCompany = companyLocDate.company;
      if (current && !current.company) current.company = companyLocDate.company;
      if (current && !current.startDate && companyLocDate.startDate) {
        current.startDate = companyLocDate.startDate;
        current.endDate = companyLocDate.endDate;
      }
      continue;
    }

    const companyHeading = parseCompanyHeading(normalizedLine);
    if (companyHeading) {
      if (pendingRole) {
        startCurrent({ company: companyHeading, role: pendingRole, startDate: pendingStartDate, endDate: pendingEndDate });
        continue;
      }
      if (current && current.company && current.role && normalizeCompany(current.company) !== normalizeCompany(companyHeading)) {
        pushCurrent();
      }
      currentCompany = companyHeading;
      if (current && !current.company) current.company = companyHeading;
      continue;
    }

    const fullHeader = parseExperienceHeader(normalizedLine);
    if (fullHeader && (fullHeader.role || fullHeader.company)) {
      startCurrent(fullHeader);
      continue;
    }

    const roleUnderCompany = parseRoleWithOptionalDates(normalizedLine, currentCompany);
    if (roleUnderCompany) {
      startCurrent(roleUnderCompany);
      continue;
    }

    if (!current && currentCompany && looksLikeRole(normalizedLine) && looksLikeRoleTitle(normalizedLine)) {
      startCurrent({ company: currentCompany, role: normalizedLine });
      continue;
    }

    if (current && !current.role && looksLikeRole(normalizedLine) && looksLikeRoleTitle(normalizedLine)) {
      current.role = normalizedLine;
      continue;
    }

    if (!current) continue;
    if (normalizedLine.length > 10) {
      // Wrapped-line repair: when the previous highlight ends without
      // a sentence terminator (".", "!", "?", ";"), the PDF parser
      // probably broke a long bullet across two lines. Merging the
      // continuation back into the previous bullet stops the editor
      // from rendering fragments like
      //     • Designed and implemented data models ... consistent data
      //     • relationships.
      // as two separate bullets — the production bug the project
      // owner reported.
      const last = current.highlights[current.highlights.length - 1];
      if (last && shouldMergeWrappedLine(last, normalizedLine)) {
        current.highlights[current.highlights.length - 1] = `${last.trimEnd()} ${normalizedLine.trimStart()}`;
      } else {
        current.highlights.push(normalizedLine);
      }
    }
  }

  // Flush any remaining pending role with dates
  if (pendingRole && (pendingStartDate || pendingEndDate)) {
    startCurrent({ company: currentCompany, role: pendingRole, startDate: pendingStartDate, endDate: pendingEndDate });
  }
  pushCurrent();
  return blocks;
}

/**
 * Split a single-line education entry of the shape
 *   "M.Tech. (Intelligent Systems and Analytics) - MIT-ADT University, Pune"
 *   "B.Tech. (IT) - Walchand College of Engineering"
 * into { degree, institution }. Returns null when the line is just a degree
 * (institution on its own separate line) so the normal flow is unaffected —
 * the right-hand side must carry an explicit institution keyword to qualify.
 */
function splitDegreeInstitution(degreeLine: string): { degree: string; institution: string } | null {
  const stripped = cleanLooseText(stripDates(degreeLine));
  if (!stripped) return null;
  for (const sep of [' - ', ' – ', ' — ', ' | ', ' at ', ', ']) {
    const idx = stripped.indexOf(sep);
    if (idx <= 0) continue;
    const left = cleanLooseText(stripped.slice(0, idx));
    const right = cleanLooseText(stripped.slice(idx + sep.length));
    if (
      left && right &&
      looksLikeEducationDegreeLine(left) &&
      /\b(university|college|school|institute|academy|polytechnic|conservatory)\b/i.test(right)
    ) {
      return { degree: left, institution: right };
    }
  }
  return null;
}

function mapEducation(sections: Record<string, string[]>) {
  let lines = [
    ...(sections.education || []),
    ...(sections.academics || []),
  ];
  // Multi-column / sidebar PDFs (pdf-parse reads the sidebar last) sometimes
  // emit the EDUCATION heading at its normal position but the actual degree
  // / institution / date lines appear later, after HOBBIES.  When that
  // happens the education section is empty (or has only fragments) and the
  // degree token lands in hobbies / unmapped.  Recover by scanning those
  // sections for a degree-shaped line and its 2-line neighbourhood.
  const degreeLooksMissing = !lines.some((line) => looksLikeEducationDegreeLine(line));
  if (degreeLooksMissing) {
    const fallbackSources = [
      ...(sections.hobbies || []),
      ...(sections.unmapped || []),
      ...(sections.projects || []),
      // Scrambled multi-column PDFs (clustered headings) can dump the degree /
      // institution lines into CERTIFICATIONS. Scanned last so genuine
      // education locations win first.
      ...(sections.certifications || []),
    ];
    const recovered: string[] = [];
    // A professional certificate often contains a degree-shaped token
    // ("Azure Developer Associate"); never mistake one for a degree here.
    const CERT_KEYWORD_RE = /\b(certified|certificate|certification|azure|aws|gcp|google\s+cloud|oracle|cisco|comptia|pmp|kubernetes|terraform|scrum\s+master)\b/i;
    for (let i = 0; i < fallbackSources.length; i += 1) {
      const line = fallbackSources[i];
      if (CERT_KEYWORD_RE.test(line)) continue;
      if (!looksLikeEducationDegreeLine(line)) continue;
      // Pull this degree line plus up to 3 neighbours that look like
      // institution / date lines.
      recovered.push(line);
      let j = i + 1;
      for (; j < Math.min(fallbackSources.length, i + 4); j += 1) {
        const neighbour = fallbackSources[j];
        if (!neighbour) continue;
        if (looksLikeEducationDegreeLine(neighbour)) break;
        if (isStandaloneDateLine(neighbour) || looksLikeEducationInstitutionLine(neighbour)) {
          recovered.push(neighbour);
        }
      }
      // Continue scanning for further degree blocks (a resume can list several
      // degrees — B.E. + Associate + High School — that all leaked into the
      // same mis-assigned section). Resume the outer loop just before the next
      // unconsumed line instead of stopping after the first block.
      i = j - 1;
    }
    if (recovered.length) lines = [...lines, ...recovered];
  }
  const blocks: EducationItem[] = [];
  let current: EducationItem | null = null;
  // When experience entries spill into the education section (e.g. multi-page
  // PDFs with page breaks), skip all lines until we find a genuine education
  // entry (degree or explicit institution keyword).
  let skipSpillover = false;
  for (const line of lines) {
    const normalizedLine = cleanLooseText(line);
    if (!normalizedLine) continue;
    if (looksLikeEducationDegreeLine(normalizedLine)) {
      skipSpillover = false;
      const dates = extractDates(normalizedLine);
      // Split "Degree - Institution" / "Degree, Institution" when both sit on
      // the same line (and strip the dates out of the degree text either way).
      const split = splitDegreeInstitution(normalizedLine);
      const degreeText = split ? split.degree : (cleanLooseText(stripDates(normalizedLine)) || normalizedLine);
      // If the current block has an institution but no degree yet, merge the
      // degree into the same block (common when institution appears on its own
      // line above the degree line).
      if (current && current.institution && !current.degree) {
        current.degree = degreeText;
        current.startDate = current.startDate || dates.start;
        current.endDate = current.endDate || dates.end;
        continue;
      }
      if (current && (current.institution || current.degree)) blocks.push(current);
      current = {
        institution: split ? split.institution : '',
        degree: degreeText,
        startDate: dates.start,
        endDate: dates.end,
        details: [],
      };
      continue;
    }
    // Re-enter education mode if we hit an explicit institution keyword
    if (skipSpillover && /\b(university|college|school|institute|academy|polytechnic)\b/i.test(normalizedLine)) {
      skipSpillover = false;
    }
    if (skipSpillover) continue;
    if (looksLikeEducationInstitutionLine(normalizedLine)) {
      if (!current) {
        current = { institution: normalizedLine, degree: '', startDate: '', endDate: '', details: [] };
        continue;
      }
      if (!current.institution) {
        current.institution = normalizedLine;
        continue;
      }
      if (current.institution && current.degree) {
        blocks.push(current);
        current = { institution: normalizedLine, degree: '', startDate: '', endDate: '', details: [] };
        continue;
      }
    }
    if (isStandaloneDateLine(normalizedLine) && current) {
      const dates = extractDates(normalizedLine);
      current.startDate = current.startDate || dates.start;
      current.endDate = current.endDate || dates.end;
      continue;
    }
    if (looksLikeRole(normalizedLine) && !looksLikeEducationDegreeLine(normalizedLine)) {
      if (current && (current.institution || current.degree)) blocks.push(current);
      current = null;
      skipSpillover = true;
      continue;
    }
    if (!current) continue;
    // Filter page footers like "1 of 1", "Page 2 of 3"
    if (/^\s*(?:page\s+)?\d+\s+of\s+\d+\s*$/i.test(normalizedLine)) continue;
    if (/^-+\s*\d+\s+of\s+\d+\s*-+$/i.test(normalizedLine)) continue;
    const detail = extractBulletLine(line);
    if (detail) {
      current.details.push(detail);
    }
  }
  if (current && (current.institution || current.degree)) blocks.push(current);
  return deduplicateEducation(blocks);
}

function deduplicateEducation(items: EducationItem[]): EducationItem[] {
  const seen = new Map<string, EducationItem>();
  for (const item of items) {
    const instKey = (item.institution || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const degKey = (item.degree || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${instKey}|${degKey}`;
    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }
    // Merge: keep the one with more details
    const existing = seen.get(key)!;
    existing.institution = existing.institution || item.institution;
    existing.degree = existing.degree || item.degree;
    existing.startDate = existing.startDate || item.startDate;
    existing.endDate = existing.endDate || item.endDate;
    existing.details = uniqueLines([...existing.details, ...item.details]);
  }
  return Array.from(seen.values());
}

function mapProjects(sections: Record<string, string[]>) {
  const lines = [
    ...(sections.projects || []),
    ...(sections.research || []),
  ];
  const projects: ProjectItem[] = [];
  let current: ProjectItem | null = null;
  for (const line of lines) {
    if (looksLikeProjectTitle(line) || isDateLine(line)) {
      if (current && current.highlights.length) projects.push(current);
      const dates = extractDates(line);
      current = { name: stripDates(line), role: '', startDate: dates.start, endDate: dates.end, highlights: [] };
      continue;
    }
    if (!current) current = { name: 'Project', role: '', startDate: '', endDate: '', highlights: [] };
    if (line.startsWith('-')) current.highlights.push(line.replace(/^[-*]\s*/, ''));
    else if (line.length > 10) current.highlights.push(line);
  }
  if (current && current.highlights.length) projects.push(current);
  // Re-join PDF-wrapped fragments so each project bullet is a whole sentence.
  for (const p of projects) p.highlights = mergeWrappedHighlights(p.highlights);
  return projects;
}

/**
 * Achievements / awards / honors → a flat list of statement strings.
 * Each non-empty line (bullet symbol stripped) becomes one achievement.
 * Multi-line wrapped statements from a PDF are joined when a continuation
 * line clearly belongs to the previous one (starts lowercase / no bullet).
 */
function mapAchievements(sections: Record<string, string[]>): string[] {
  const lines = sections.achievements || [];
  if (!lines.length) return [];
  const out: string[] = [];
  for (const rawLine of lines) {
    // Stop if a different section heading leaked into this block.
    const heading = normalizeHeading(rawLine);
    if (heading && heading !== 'achievements') break;
    const line = String(rawLine || '').replace(/^[-*•·]\s*/, '').trim();
    if (!line) continue;
    // Skip obvious non-achievement noise (contact lines, bare dates).
    if (/@/.test(line) || /\b\d{7,}\b/.test(line)) continue;
    const startsBullet = /^[-*•·]/.test(rawLine.trim());
    const looksLikeContinuation =
      out.length > 0
      && !startsBullet
      && /^[a-z]/.test(line); // lowercase start → wrapped from previous line
    if (looksLikeContinuation) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`.replace(/\s{2,}/g, ' ').trim();
    } else if (line.length >= 3) {
      out.push(line);
    }
  }
  // Cap to a sane number so a mis-routed section can't explode the list.
  return out.slice(0, 30);
}

// ------------------------------------------------------------------
// Inline-fallback extractors. Used ONLY when the dedicated section
// returned zero rows. They never replace data — they only fill an
// empty section by scanning experience-bullet / summary text.
// ------------------------------------------------------------------

const KNOWN_LANGUAGES = [
  // Indian + South Asian
  'English', 'Hindi', 'Marathi', 'Bengali', 'Tamil', 'Telugu', 'Kannada',
  'Malayalam', 'Punjabi', 'Gujarati', 'Odia', 'Assamese', 'Urdu', 'Sanskrit',
  'Sinhala', 'Nepali',
  // Major world languages
  'Spanish', 'French', 'German', 'Mandarin', 'Cantonese', 'Chinese', 'Japanese',
  'Korean', 'Arabic', 'Portuguese', 'Italian', 'Russian', 'Dutch', 'Swedish',
  'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Greek', 'Hebrew',
  'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino', 'Tagalog', 'Swahili',
];
const LANGUAGE_INTRO_RE = /\b(speaks?|speaking|fluent in|fluent at|proficient in|conversational in|native(?: speaker of| in)?|languages?(?: known| spoken)?)\s*[:\-]?\s*/i;

export function extractInlineLanguages(bullets: string[]): string[] {
  const found = new Set<string>();
  const tokens = new Set(KNOWN_LANGUAGES.map((l) => l.toLowerCase()));
  for (const raw of bullets) {
    const line = String(raw || '');
    // Require either an explicit intro ("Speaks X, Y") or a tightly
    // grouped list of language tokens. Without a guard we'd match
    // "Java" as Javanese, "C" as Cantonese, etc. — false positives in
    // tech bullets.
    const introMatch = line.match(LANGUAGE_INTRO_RE);
    if (!introMatch) continue;
    const tail = line.slice(introMatch.index! + introMatch[0].length);
    // Stop at the first sentence-end character so "Fluent in English.
    // Built React apps." doesn't pull "Built React apps".
    const segment = tail.split(/[.!?]/)[0] || '';
    for (const word of segment.split(/[\s,;|/&]+/)) {
      const w = word.trim().replace(/[^A-Za-z]/g, '');
      if (!w) continue;
      if (tokens.has(w.toLowerCase())) {
        // Title-case for display: first capital, rest lower.
        found.add(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      }
    }
  }
  return Array.from(found).slice(0, 10);
}

// "<vendor> Certified <name> <level>" — captures the full credential
// name. Vendor prefix + the word "Certified" anchor it strongly so
// we don't accidentally pull "Built apps on AWS" as a cert.
// "<vendor> [Certified] <name> <level>" — captures full credential
// name. "Certified" is OPTIONAL because many real resumes write the
// shorter "Azure DevOps Engineer Expert" / "Azure Developer Associate"
// forms. We anchor on either the "Certified" keyword OR a recognised
// level word (Associate / Professional / Expert / etc.) so a generic
// bullet like "Used Azure DevOps" never matches — it lacks a level.
const CERT_VENDOR_RE = /\b(AWS|Azure|GCP|Google Cloud|Cisco|Microsoft|Oracle|Red Hat|RedHat|CompTIA|Salesforce|HashiCorp|VMware|Adobe|SAP|Kubernetes|Docker|MongoDB|Snowflake|Databricks)\s+(?:Certified\s+)?([A-Z][\w\s\-]{2,60}?(?:Associate|Professional|Specialist|Expert|Foundation|Practitioner|Architect|Developer|Administrator|Engineer|Master|Operator|Designer|Consultant))\b/g;
// Standalone credential codes that don't follow the vendor pattern.
const CERT_CODE_RE = /\b(PMP|PRINCE2|CSM|CSPO|CFA|CPA|FRM|CISSP|CISM|CISA|CEH|OSCP|CCNA|CCNP|CCIE|RHCSA|RHCE|CKA|CKAD|CKS|MCSA|MCSE|TOGAF|ITIL Foundation|ITIL Practitioner|ITIL Expert|ISTQB)\b/;
const CERT_CREDENTIAL_VERB_RE = /\b(certified|certification|certificate|credential)\b/i;

export function extractInlineCertifications(
  bullets: string[],
): Array<{ name: string; issuer?: string; date?: string; details: string[] }> {
  const found: Array<{ name: string; issuer?: string; date?: string; details: string[] }> = [];
  const seen = new Set<string>();
  for (const raw of bullets) {
    const line = String(raw || '').trim();
    if (!line) continue;
    // Try the vendor pattern first — captures "AWS Certified <X> <level>"
    // as a whole credential name.
    const hasCertifiedWord = /\bcertified\b/i.test(line);
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    const hasCertLabel = /\bcertif/i.test(line) || /\bcredential/i.test(line);
    const yearMatch = line.match(/\b(19|20)\d{2}\b/);
    const candidates: string[] = [];
    // matchAll so a comma-separated "Cert1 Associate (2025), Cert2
    // Associate (2025)" line surfaces BOTH certs, not just the first.
    for (const m of line.matchAll(CERT_VENDOR_RE)) {
      // Vendor + level is a strong signal but not bulletproof — guard
      // against false positives by requiring at least one of: the
      // word "Certified" in the same line, a year-like token, or a
      // "Certifications" label. Without this guard a generic bullet
      // "Deployed via Azure DevOps Engineer Expert pipelines" would
      // extract as a phantom credential.
      if (!(hasCertifiedWord || hasYear || hasCertLabel)) continue;
      const literal = `${m[1]} ${hasCertifiedWord ? 'Certified ' : ''}${m[2]}`;
      candidates.push(literal.replace(/\s{2,}/g, ' ').trim());
    }
    if (!candidates.length) {
      // Standalone codes only count if the bullet also has a
      // credential verb nearby — otherwise random "CFA" mentions in
      // case-study bullets would pollute the list.
      const codeMatch = line.match(CERT_CODE_RE);
      if (codeMatch && CERT_CREDENTIAL_VERB_RE.test(line)) {
        candidates.push(codeMatch[1]);
      }
    }
    for (const name of candidates) {
      if (name.length < 3 || name.length > 80) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        name,
        date: yearMatch ? yearMatch[0] : undefined,
        details: [],
      });
      if (found.length >= 8) break;
    }
    if (found.length >= 8) break;
  }
  return found;
}

// Bullets that LOOK like achievements (awards, recognitions, ranked
// finishes) when no dedicated section was detected. We require an
// explicit signal word — without it almost any bullet could pass.
const ACHIEVEMENT_SIGNAL_RE = /\b(awarded|won|recognized|recognised|honou?red|received the|earned the|named the|ranked (?:#?\d|first|second|third|top)|finalist|runner[- ]up|champion|prize winner|gold medal|silver medal|bronze medal|distinction|top \d+%|hall of fame|nominee|nominated)\b/i;

export function extractInlineAchievements(bullets: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const raw of bullets) {
    const line = String(raw || '').replace(/^[-*•·]\s*/, '').trim();
    if (!line || line.length < 20 || line.length > 300) continue;
    if (!ACHIEVEMENT_SIGNAL_RE.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(line);
    if (found.length >= 10) break;
  }
  return found;
}

/**
 * R-077 — licensure lines become structured LicenseItems. A line like
 * "Medical Registration — National Medical Commission, Reg No. NMC-12345,
 * valid till 2030" yields name/authority/licenseNumber/validTill.
 */
export function mapLicenses(sections: Record<string, string[]>) {
  const lines = sections.licenses || [];
  const items: Array<{ name: string; authority?: string; licenseNumber?: string; region?: string; validTill?: string }> = [];
  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/^[-*•·]\s*/, '').trim();
    if (!line || line.length < 3) continue;
    // Require an explicit "No./Number/#" marker or a digit-bearing token so
    // prose like "Registration — National Medical Commission" never captures.
    const numMatch = line.match(/(?:licen[cs]e|reg(?:istration)?|enrol?l?ment)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,})/i)
      || line.match(/\b(?:no\.?|#)\s*[:\-]?\s*([A-Za-z]{0,5}[-\/]?\d[A-Za-z0-9\/\-]{2,})/i);
    const validMatch = line.match(/valid\s+(?:till|until|through|upto|up to)\s+([A-Za-z0-9\/\- ]{4,20})/i);
    let rest = line
      .replace(numMatch ? numMatch[0] : '', '')
      .replace(validMatch ? validMatch[0] : '', '')
      .replace(/[,;\s]+$/g, '').trim();
    // "Name — Authority" or "Name - Authority" or "Name, Authority"
    let name = rest, authority: string | undefined;
    const split = rest.split(/\s+[—–-]\s+|,\s+/);
    if (split.length >= 2) {
      name = split[0].trim();
      authority = split.slice(1).join(', ').replace(/[,;\s]+$/g, '').trim() || undefined;
    }
    if (!name) continue;
    items.push({
      name,
      authority,
      licenseNumber: numMatch ? numMatch[1] : undefined,
      validTill: validMatch ? validMatch[1].trim() : undefined,
    });
    if (items.length >= 12) break;
  }
  return items;
}

/**
 * R-077 — publication/patent lines become structured PublicationItems.
 * "Title, Venue (2024)" / "Title — Venue, 2024" / lines mentioning
 * "patent" are typed as patents.
 */
export function mapPublications(sections: Record<string, string[]>) {
  const lines = sections.publications || [];
  const items: Array<{ title: string; venue?: string; year?: string; url?: string; type?: 'publication' | 'patent' }> = [];
  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/^[-*•·]\s*/, '').replace(/^\d{1,2}[.)]\s*/, '').trim();
    if (!line || line.length < 8) continue;
    const yearMatch = line.match(/\b(19|20)\d{2}\b/);
    const urlMatch = line.match(/https?:\/\/\S+/i);
    const isPatent = /\bpatent\b/i.test(line);
    let rest = line
      .replace(urlMatch ? urlMatch[0] : '', '')
      .replace(/[\(\[]?\b(19|20)\d{2}\b[\)\]]?/, '')
      .replace(/,?\s*\bpatents?\b\s*(pending|filed|granted)?\s*$/i, '')
      .replace(/[,;\s]+$/g, '').trim();
    let title = rest, venue: string | undefined;
    const split = rest.split(/\s+[—–]\s+|",\s*|,\s+(?=[A-Z])/);
    if (split.length >= 2) {
      title = split[0].replace(/^["']|["']$/g, '').trim();
      venue = split.slice(1).join(', ').replace(/[,;\s]+$/g, '').trim() || undefined;
    }
    if (!title) continue;
    items.push({
      title,
      venue,
      year: yearMatch ? yearMatch[0] : undefined,
      url: urlMatch ? urlMatch[0].replace(/[),.]+$/, '') : undefined,
      type: isPatent ? 'patent' : undefined,
    });
    if (items.length >= 20) break;
  }
  return items;
}

function mapCertifications(sections: Record<string, string[]>) {
  const lines = [
    ...(sections.certifications || []),
  ];
  const items: CertificationItem[] = [];
  for (const rawLine of lines) {
    // Stop if we hit a sub-section heading that was not split by the section normalizer
    const heading = normalizeHeading(rawLine);
    if (heading && heading !== 'certifications') break;
    const line = String(rawLine || '').replace(/^[-*•·]\s*/, '').trim();
    if (!line) continue;
    // A scrambled multi-column PDF (clustered headings) can dump contact info,
    // education and summary prose into the certifications section. Skip those
    // so they don't surface as phantom certificates — the education lines are
    // recovered separately by mapEducation's fallback scan.
    if (/@/.test(line) || /\b\d{7,}\b/.test(line)) continue; // contact (email / phone)
    if (/^(linkedin|github|portfolio|website|e-?mail|phone|mobile|contact|address)\b/i.test(line)) continue; // contact labels
    if (isStandaloneDateLine(line)) continue;                // a bare date range is not a certificate
    if (/^[a-z]/.test(line)) continue;                       // lowercase start → wrapped prose fragment, not a cert name
    // Real degree lines (BE, B.Tech, Bachelor, Master, MBA, PhD…) — but NOT a
    // certificate that merely contains "associate"/"diploma" (e.g.
    // "Azure Developer Associate" must stay a certificate).
    if (/\b(b\.?e\.?|b\.?tech|b\.?sc|b\.?a\.?|b\.?com|bba|bca|bachelor|m\.?e\.?|m\.?tech|m\.?sc|m\.?a\.?|m\.?com|mba|mca|master|ph\.?d|doctorate|b\.?des|m\.?des|b\.?arch|b\.?pharm|b\.?ed|b\.?f\.?a|b\.?voc)\b/i.test(line)
      && !/\b(certified|certificate|certification|course|training)\b/i.test(line)) continue;
    if (/\b(university|college|institute|cgpa|gpa)\b/i.test(line)
      && !/\b(certified|certificate|certification|course|training)\b/i.test(line)) continue;
    {
      // Sentence-style summary prose (many words, no credential keyword) is not
      // a certificate. Credential keywords keep real multi-word certs.
      const probe = line.replace(/[()]/g, '').replace(/\b(20\d{2}|19\d{2})\b/g, '').trim();
      const wordCount = probe.split(/\s+/).filter(Boolean).length;
      if (wordCount > 10
        && !/\b(certified|certificate|certification|course|training|nanodegree|associate|professional|expert|specialist|fundamentals|practitioner|bootcamp|scrum|master|developer|architect|administrator|foundation)\b/i.test(probe)) {
        continue;
      }
    }
    // Two-column ATS templates sometimes emit the certification name+year on
    // one line and the issuer ("Microsoft", "Amazon", "Google") on the next.
    // Merge a stand-alone single-token title-cased line into the previous
    // cert as its issuer rather than registering a phantom "Microsoft" cert.
    if (items.length && !items[items.length - 1].issuer) {
      const prev = items[items.length - 1];
      const isShortIssuerToken = /^[A-Z][A-Za-z0-9&'.\-]+(?:\s+[A-Z][A-Za-z0-9&'.\-]+)?$/.test(line)
        && line.length <= 30
        && !/\d/.test(line)
        && line.split(/\s+/).filter(Boolean).length <= 2;
      if (isShortIssuerToken) {
        prev.issuer = line;
        continue;
      }
    }
    const dateMatch = line.match(/\b(20\d{2}|19\d{2})\b/);
    // Pull issuer out of trailing parens like "Azure AZ900 (Microsoft - 2022)"
    // or "AWS Certified (Amazon, 2023)".  When the paren contents reduce to
    // empty after stripping the year, treat it as a year-only paren and skip
    // the issuer field.
    let nameRaw = line;
    let issuer: string | undefined;
    const parenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      const issuerCandidate = parenMatch[2]
        .replace(/\b(20\d{2}|19\d{2})\b/g, '')
        .replace(/^\s*[-–—|,]\s*/, '')
        .replace(/\s*[-–—|,]\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (issuerCandidate) {
        nameRaw = parenMatch[1].trim();
        issuer = issuerCandidate;
      }
    }
    const cleaned = nameRaw
      .replace(/[()]/g, '')
      .replace(/\b(20\d{2}|19\d{2})\b/g, '')
      .replace(/\s*[-–—|,:]\s*$/g, '')
      .replace(/^\s*[-–—|,:]\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!cleaned) continue;
    // Skip lines that are clearly not certifications (hobby descriptions, long sentences)
    if (cleaned.length > 100) continue;
    if (/^(exploring|writing|playing|engaging|mentoring|reading|traveling|cooking|running|swimming|hiking|yoga)\b/i.test(cleaned)) continue;
    items.push({
      name: cleaned,
      issuer,
      date: dateMatch ? dateMatch[1] : undefined,
      details: [],
    });
  }
  return items;
}

function mapHeader(lines: string[]): HeaderMapping {
  const cleanLines = lines.map((line) => cleanLooseText(line)).filter(Boolean);
  const allText = cleanLines.join(' ');
  const anchorIndex = findContactAnchorIndex(cleanLines);
  const candidateIndexes = new Set<number>();
  const anchorStart = anchorIndex >= 0 ? Math.max(0, anchorIndex - 8) : 0;
  const anchorEnd = anchorIndex >= 0 ? Math.min(cleanLines.length - 1, anchorIndex + 2) : Math.min(cleanLines.length - 1, 14);
  for (let i = anchorStart; i <= anchorEnd; i += 1) candidateIndexes.add(i);
  for (let i = 0; i < Math.min(cleanLines.length, 16); i += 1) candidateIndexes.add(i);

  let bestName = '';
  let bestNameIndex = -1;
  let bestNameScore = Number.NEGATIVE_INFINITY;
  for (const index of candidateIndexes) {
    const candidate = cleanLines[index];
    const score = scoreNameCandidate(candidate, index, anchorIndex, cleanLines);
    if (score <= bestNameScore) continue;
    bestNameScore = score;
    bestName = candidate;
    bestNameIndex = index;
  }
  // Fallback: in two-column DOCX exports (e.g. Canva sidebar), mammoth flattens
  // the document so the sidebar contact block (phone/email/Linked­In/Contact)
  // appears BEFORE the name, which lives at the top of the right column. The
  // anchor-window search above only looks 2 lines past the anchor, so the
  // name gets missed entirely. Widen the search post-anchor when no candidate
  // surfaced — but keep the score-based pick so legitimate top-of-document
  // names still win when present.
  if (bestNameScore < 0 && anchorIndex >= 0) {
    const fallbackEnd = Math.min(cleanLines.length - 1, anchorIndex + 12);
    for (let i = anchorEnd + 1; i <= fallbackEnd; i += 1) {
      const candidate = cleanLines[i];
      const score = scoreNameCandidate(candidate, i, anchorIndex, cleanLines);
      if (score <= bestNameScore) continue;
      bestNameScore = score;
      bestName = candidate;
      bestNameIndex = i;
    }
  }
  if (bestNameScore < 0) {
    bestName = '';
    bestNameIndex = -1;
  }
  // Normalize ALL-CAPS names to Title Case (e.g. "JOHN DOE" → "John Doe")
  if (bestName && /^[A-Z\s.'-]+$/.test(bestName) && bestName.length > 1) {
    bestName = bestName.replace(/\b([A-Z])([A-Z]+)\b/g, (_, first, rest) => first + rest.toLowerCase());
  }

  const headline = extractHeadline(cleanLines, bestNameIndex);
  const emailMatch = allText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = allText.match(/(?:mobile(?:\s*no)?|phone|contact)?[:\s-]*(\+?\d[\d\s().-]{7,}\d)/i);
  const links = cleanLines
    .flatMap((line) => {
      const matches = Array.from(line.matchAll(/https?:\/\/[^\s]+/gi)).map((item) => cleanLooseText(item[0] || ''));
      if (matches.length) return matches;
      if (/linkedin\.com|github\.com|portfolio|website/i.test(line)) return [line];
      return [];
    })
    .map((line) => cleanLooseText(line))
    .filter(Boolean)
    .slice(0, 3);
  const location = extractLocation(cleanLines);

  if (bestName.length < 2 && !emailMatch && !phoneMatch) {
    return { fullName: '', headline: '', contact: undefined };
  }

  // Even when no name is found, return contact with email/phone/location/links
  // so that ATS PDF round-trips still recover contact info.
  return {
    fullName: bestName,
    headline,
    contact: {
      fullName: bestName,
      email: emailMatch ? emailMatch[0] : undefined,
      phone: phoneMatch ? cleanLooseText(phoneMatch[1] || phoneMatch[0]) : undefined,
      location: location || undefined,
      links: links.length ? links : undefined,
    },
  };
}

function guessTitle(lines: string[], header: HeaderMapping) {
  const headlineTitle = normalizeHeadlineForTitle(header.headline);
  if (headlineTitle && !isBlockedTitleValue(headlineTitle)) {
    return headlineTitle;
  }

  const roleCandidate = lines
    .map((line) => cleanLooseText(line))
    .find((line) => {
      if (!line) return false;
      if (isBlockedTitleValue(line)) return false;
      if (line.length > 140 || /@|https?:\/\/|www\./i.test(line)) return false;
      if (!ROLE_HINT_RE.test(line)) return false;
      if (!/[|/]|(?:\s[-–—]\s)/.test(line)) return false;
      // Reject lines that contain date ranges (these are experience entries, not titles)
      if (/\b\d{1,2}[/-]\d{4}\b/.test(line) || /\b(20\d{2}|19\d{2})[-/]\d{1,2}\b/.test(line)) return false;
      return true;
    });
  if (roleCandidate) {
    return normalizeHeadlineForTitle(roleCandidate);
  }

  const fullName = cleanLooseText(header.contact?.fullName || header.fullName || '');
  if (fullName && !isBlockedTitleValue(fullName)) {
    return `${fullName} Resume`;
  }

  return 'Software Engineer Resume';
}

function findContactAnchorIndex(lines: string[]) {
  return lines.findIndex((line) => /@|linkedin\.com|github\.com|mobile|phone|contact|email/i.test(line));
}

function scoreNameCandidate(line: string, index: number, anchorIndex: number, lines?: string[]) {
  if (!isLikelyNameLine(line)) return Number.NEGATIVE_INFINITY;
  const words = line.split(/\s+/).filter(Boolean);
  let score = 12;
  if (words.length === 2) score += 4;
  else if (words.length === 3) score += 2;
  else score += 1;
  const strictName = /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(line);
  if (strictName) score += 6;
  if (anchorIndex >= 0) {
    if (index <= anchorIndex) score += 2;
    score -= Math.abs(anchorIndex - index) * 0.3;
  }
  if (ROLE_HINT_RE.test(line)) score -= 6;
  // Strong bonus for the very first non-empty line — resumes almost always start with the name
  if (index === 0) score += 5;
  // Penalize lines that appear immediately after a headline-like line (pipe/dash delimiters)
  // — they are likely a continuation of the headline, not the candidate's name
  if (lines && index > 0) {
    const prevLine = lines[index - 1] || '';
    if (/[|/]/.test(prevLine) || /\s[-–—]\s/.test(prevLine)) score -= 8;
  }
  // Penalize common professional/technical terms that look like names but aren't
  if (HEADLINE_FRAGMENT_RE.test(line)) score -= 10;
  return score;
}

function isLikelyNameLine(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned || cleaned.length > 56 || cleaned.length < 3) return false;
  if (isBlockedTitleValue(cleaned)) return false;
  if (NAME_BLOCKLIST_RE.test(cleaned)) return false;
  if (CONTACT_LABEL_RE.test(cleaned)) return false;
  if (/@|https?:\/\/|www\./i.test(cleaned)) return false;
  if (/[|/:]/.test(cleaned)) return false;
  if (/\d/.test(cleaned)) return false;
  if (COMPANY_SUFFIX_RE.test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word));
}

function extractHeadline(lines: string[], nameIndex: number) {
  if (nameIndex < 0) return '';
  // Search up to 10 lines after the name — contact info (mobile, email, address)
  // often sits between the name and the headline/tagline.
  const searchLimit = Math.min(lines.length, nameIndex + 11);
  for (let idx = nameIndex + 1; idx < searchLimit; idx += 1) {
    const candidate = cleanLooseText(lines[idx] || '');
    if (!candidate) continue;
    if (isLikelyHeadlineLine(candidate)) return candidate;
  }
  return '';
}

function isLikelyHeadlineLine(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  if (isBlockedTitleValue(cleaned)) return false;
  if (/@|https?:\/\/|www\./i.test(cleaned)) return false;
  if (/\d{6,}/.test(cleaned)) return false;
  if (cleaned.length < 8 || cleaned.length > 140) return false;
  const hasDelimiter = /[|/]|(?:\s[-–—]\s)/.test(cleaned);
  if (!hasDelimiter) return false;
  return ROLE_HINT_RE.test(cleaned);
}

function extractLocation(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/address\s*:/i.test(line)) {
      const match = line.match(/address\s*:\s*(.+?)(?:\s+date of birth|$)/i);
      const value = cleanLooseText(match ? match[1] : line.replace(/address\s*:/i, ''));
      if (value) return value;
      // Address label on its own line — check the next non-empty line
      for (let j = i + 1; j < Math.min(lines.length, i + 3); j += 1) {
        const next = cleanLooseText(lines[j]);
        if (!next) continue;
        // Skip if next line looks like another label or section heading
        if (CONTACT_LABEL_RE.test(next) || normalizeHeading(lines[j])) break;
        return next;
      }
    }
  }
  // Fallback: look for lines that contain location-like patterns
  const fallback = lines.find((line) => {
    const cleaned = cleanLooseText(line);
    // Match city/ZIP patterns like "Wagholi, Pune - 411057"
    if (/\b\d{5,6}\b/.test(cleaned) && /,/.test(cleaned)) return true;
    return /\b(remote|usa|united states|india|canada|uk)\b/i.test(cleaned) || /\b[A-Z]{2}\s*\d{4,6}\b/.test(cleaned);
  });
  if (!fallback) return '';
  // If the line is pipe-separated (e.g. "email | phone | City, ST 12345 | url"), extract only the location segment
  if (fallback.includes('|')) {
    const segments = fallback.split('|').map((s) => s.trim());
    const locSegment = segments.find((seg) => {
      if (/@/.test(seg)) return false;
      if (/https?:\/\//i.test(seg)) return false;
      if (/^\+?\d[\d\s().-]{5,}\d$/.test(seg.replace(/\s+/g, ''))) return false;
      return /\b\d{5,6}\b/.test(seg) || /,/.test(seg) || /\b(remote|usa|united states|india|canada|uk)\b/i.test(seg) || /\b[A-Z]{2}\s*\d{4,6}\b/.test(seg);
    });
    return cleanLooseText(locSegment || '');
  }
  return cleanLooseText(fallback);
}

function isBlockedTitleValue(value: string) {
  const normalized = cleanLooseText(value).toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  if (TITLE_BLOCKLIST.has(normalized)) return true;
  return Boolean(normalizeHeading(value));
}

function normalizeHeadlineForTitle(value: string) {
  const cleaned = cleanLooseText(value);
  if (!cleaned) return '';
  return cleaned
    .replace(/\s*\|\s*/g, ' / ')
    .replace(/\s*[–—]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUnmappedText(sections: Record<string, string[]>) {
  const mappedKeys = new Set([
    'summary', 'profile', 'objective',
    'skills', 'core', 'technical', 'technologies',
    'experience', 'employment', 'work', 'career',
    'education', 'academics',
    'projects', 'research',
    'certifications', 'licenses', 'publications',
    'languages', 'hobbies',
  ]);
  return Object.entries(sections)
    .filter(([key]) => !mappedKeys.has(key))
    .flatMap(([, lines]) => lines)
    .join('\n')
    .trim();
}

function sanitizeExperienceForStrictSave(items: ExperienceItem[]) {
  const cleanItems: ExperienceItem[] = [];
  const rejected: string[] = [];
  for (const item of items) {
    const company = cleanCompanyName(item.company);
    const role = cleanLooseText(item.role);
    const startDate = normalizeDateToken(cleanLooseText(item.startDate));
    const endDate = normalizeDateToken(cleanLooseText(item.endDate));
    const highlights = mergeWrappedHighlights(
      uniqueLines(
        item.highlights
          .map((line: string) => cleanLooseText(line))
          .filter((line: string) => isMeaningfulHighlight(line)),
      ),
    );

    const hasAnyContent = Boolean(company || role || startDate || endDate || highlights.length);
    if (!hasAnyContent) continue;
    if (company.length < 2 || role.length < 2) {
      rejected.push(buildRejectedLine('Experience', [role, company, startDate, endDate, ...highlights]));
      continue;
    }
    cleanItems.push({ company, role, startDate, endDate, highlights });
  }
  return { items: cleanItems, rejected };
}

function sanitizeEducationForStrictSave(items: EducationItem[]) {
  const cleanItems: EducationItem[] = [];
  const rejected: string[] = [];
  for (const item of items) {
    const institution = cleanLooseText(item.institution);
    const degree = cleanLooseText(item.degree);
    const startDate = normalizeDateToken(cleanLooseText(item.startDate));
    const endDate = normalizeDateToken(cleanLooseText(item.endDate));
    const details = item.details.map((line: string) => cleanLooseText(line)).filter(Boolean);

    const hasCore = Boolean(institution || degree);
    if (!hasCore) continue;
    const strictValid = (
      (institution.length >= 2 || degree.length >= 2)
    );
    if (!strictValid) {
      rejected.push(buildRejectedLine('Education', [degree, institution, startDate, endDate, ...details]));
      continue;
    }
    cleanItems.push({ institution, degree, startDate, endDate, details });
  }
  return { items: cleanItems, rejected };
}

function mergeUnmappedText(base: string, additions: string[]) {
  const merged = [base, ...additions]
    .map((line) => cleanLooseText(line))
    .filter(Boolean);
  return uniqueLines(merged).join('\n').trim();
}

function buildRejectedLine(prefix: string, parts: string[]) {
  const text = parts.map((part) => cleanLooseText(part)).filter(Boolean).join(' | ');
  return `From Upload (Unsorted): ${prefix}: ${text || 'Unstructured content'}`;
}

function cleanLooseText(value: string) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[|:;,\-–—_*•·/\\]+\s*/g, '')
    .replace(/\s*[|:;,\-–—_*•·/\\]+$/g, '')
    .trim();
  if (!text) return '';
  if (isPlaceholderValue(text)) return '';
  return text;
}

function isPlaceholderValue(value: string) {
  return /^[-–—_*•·|/\\]+$/.test(value) || PLACEHOLDER_ONLY_RE.test(value);
}

function hasMeaningfulText(value: string) {
  if (!value) return false;
  // Must contain at least two alphanumeric characters to be a real role/company.
  const alnum = value.match(/[A-Za-z0-9]/g);
  return Boolean(alnum && alnum.length >= 2);
}

function collectLikelyExperienceLines(lines: string[]) {
  const output: string[] = [];
  for (const rawLine of lines) {
    const line = normalizeLegacyBulletPrefix(rawLine);
    if (!line) continue;
    if (looksLikeExperienceHeader(line) || looksLikeCompany(line) || looksLikeRole(line) || line.startsWith('-') || isDateLine(line)) {
      output.push(line);
      continue;
    }
    if (output.length && line.length > 8) output.push(line);
  }
  return output;
}

/**
 * Surgically recover experience entries from lines that were mis-assigned to
 * other sections because a multi-column PDF clustered the section headings
 * together (leaving the real WORK EXPERIENCE section empty).
 *
 * Unlike collectLikelyExperienceLines (which greedily grabs every role/company/
 * bullet-shaped line and would vacuum up education, awards and summary prose),
 * this only emits a job header — a role/company line that is adjacent to a date
 * range — plus the date line and any bullets that immediately follow it. That
 * keeps the recovery precise instead of dumping the whole mis-assigned section
 * into experience.
 */
function recoverClusteredExperienceBlocks(lines: string[]): string[] {
  const CERT_NOUN_RE = /\b(certificate|certification|certified|award|license|licensed|diploma|accreditation|nanodegree)\b/i;
  const isHeaderLine = (raw: string) => {
    const stripped = cleanLooseText(stripDates(raw));
    if (!stripped || stripped.length < 4) return false;
    if (CERT_NOUN_RE.test(stripped)) return false;
    if (looksLikeEducationRoleLine(stripped) || looksLikeEducationDegreeLine(stripped)) return false;
    if (parseRoleCompanyPair(stripped)) return true;
    return looksLikeRole(stripped) && looksLikeRoleTitle(stripped);
  };
  // When walking backward to gather a role's preceding bullets, STOP only at a
  // hard boundary — a date, an education degree/institution line, a contact
  // line, or a section heading. We deliberately do NOT stop on header-shaped
  // sentences here: a long bullet like "Automated … using Azure DevOps,
  // Jenkins" pattern-matches as role+company and would otherwise truncate the
  // bullet run. Backward collection only runs for the single mis-clustered job
  // (no bullets followed its header), so over-collection isn't a concern.
  const stopsBackwardScan = (raw: string) => {
    const t = cleanLooseText(raw);
    if (!t || t.length < 10) return true;
    if (isDateLine(t)) return true;
    if (CERT_NOUN_RE.test(t)) return true;
    if (looksLikeEducationDegreeLine(t) || looksLikeEducationInstitutionLine(t)) return true;
    if (/@|\b\d{7,}\b/.test(t)) return true; // contact
    if (normalizeHeading(t)) return true;    // section heading
    return false;
  };
  const out: string[] = [];
  const usedDate = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanLooseText(lines[i]);
    if (!line || !isHeaderLine(line)) continue;
    // Require a date range on the header itself or within the next two lines.
    let dateIdx = isDateLine(line) ? i : -1;
    if (dateIdx < 0) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {
        if (isStandaloneDateLine(cleanLooseText(lines[j]))) { dateIdx = j; break; }
      }
    }
    if (dateIdx < 0) continue;
    out.push(line);
    if (dateIdx !== i && !usedDate.has(dateIdx)) {
      out.push(cleanLooseText(lines[dateIdx]));
      usedDate.add(dateIdx);
    }
    // Pull bullets that immediately follow the header/date block; stop at the
    // first non-bullet line so prose never leaks in.
    let forwardCount = 0;
    for (let k = Math.max(i, dateIdx) + 1; k < lines.length; k += 1) {
      if (!cleanLooseText(lines[k])) break;
      if (!extractBulletLine(lines[k]) && !/^\s*[-*•·]/.test(lines[k])) break;
      out.push(lines[k]);
      forwardCount += 1;
    }
    // Scrambled layouts (clustered headings) sometimes place the role's bullets
    // BEFORE its header. When nothing followed the header, walk backward over
    // the contiguous run of description lines that precede it and emit them as
    // highlights (after the header) so the role isn't left with no detail.
    if (forwardCount === 0) {
      const backward: string[] = [];
      for (let b = i - 1; b >= 0 && backward.length < 30; b -= 1) {
        if (stopsBackwardScan(lines[b])) break;
        backward.push(cleanLooseText(lines[b]));
      }
      backward.reverse();
      // Merge PDF-wrapped sentence fragments into logical bullets, then emit
      // each as a "- " bullet. Emitting raw sentences would let the experience
      // mapper re-parse a line like "… using Azure DevOps, Jenkins" as a brand
      // new job header and split the run; a "- " prefix forces bullet handling.
      const bullets: string[] = [];
      for (const dl of backward) {
        if (!dl) continue;
        if (bullets.length && shouldMergeWrappedLine(bullets[bullets.length - 1], dl)) {
          bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${dl}`;
        } else {
          bullets.push(dl);
        }
      }
      for (const b of bullets) out.push(`- ${b}`);
    }
  }
  return out;
}

function buildExperienceSource(parsed: ParsedResumeText) {
  const sectionLines = [
    ...(parsed.sections.experience || []),
    ...(parsed.sections.employment || []),
    ...(parsed.sections.work || []),
    ...(parsed.sections.career || []),
  ];
  // Detect experience content that leaked into other sections (e.g. EDUCATION
  // after a page break, or — when section headings are clustered together at
  // the top by a multi-column PDF — the whole experience block landing under
  // the wrong heading). Collected once so it can recover experience both when
  // the experience section has lines AND when it is empty.
  const skipSpillover = new Set(['skills', 'summary', 'profile', 'objective']);
  const otherSections = Object.entries(parsed.sections)
    .filter(([key]) => !['experience', 'employment', 'work', 'career', 'unmapped'].includes(key))
    .filter(([key]) => !skipSpillover.has(key));
  const otherLines = otherSections.flatMap(([, lines]) => lines);
  // A spillover-shaped section must contain either (a) at least two role-title
  // lines, or (b) a role line adjacent to a date range. Otherwise legitimate
  // sections (CERTIFICATIONS with "TensorFlow Developer Certificate (2022)")
  // would trigger spillover and pollute experience.
  const CERT_NOUN_RE = /\b(certificate|certification|certified|award|license|licensed|diploma|accreditation|nanodegree)\b/i;
  const isRoleishLine = (l: string) => {
    const stripped = cleanLooseText(stripDates(l));
    if (!stripped) return false;
    if (CERT_NOUN_RE.test(stripped)) return false;
    return looksLikeRole(stripped) && looksLikeRoleTitle(stripped) && !looksLikeEducationRoleLine(stripped);
  };
  const roleishLines = otherLines.filter(isRoleishLine);
  let roleAdjacentToDate = false;
  for (let i = 0; i < otherLines.length; i += 1) {
    if (!isRoleishLine(otherLines[i])) continue;
    if (isDateLine(otherLines[i])) { roleAdjacentToDate = true; break; }
    for (let j = i + 1; j <= Math.min(i + 3, otherLines.length - 1); j += 1) {
      if (isDateLine(otherLines[j])) { roleAdjacentToDate = true; break; }
    }
    if (roleAdjacentToDate) break;
  }
  const hasRoleCompany = roleishLines.length >= 2 || roleAdjacentToDate;
  const spillover = hasRoleCompany ? collectLikelyExperienceLines(otherLines) : [];

  // Prefer section-parsed lines when available — the tail approach leaks
  // education/certification content into the experience mapper.
  if (sectionLines.length) {
    if (spillover.length) return [...sectionLines, ...spillover];
    return sectionLines;
  }
  // Experience section is EMPTY. A multi-column PDF can cluster every section
  // heading together at the top ("SUMMARY\nWORK EXPERIENCE\nEDUCATION") so the
  // experience body lands under a later heading. Surgically recover just the
  // job header(s) — a role/company line adjacent to a date range — plus their
  // trailing bullets, WITHOUT vacuuming up the surrounding education / award /
  // summary prose that also lives in those mis-assigned sections.
  const clustered = recoverClusteredExperienceBlocks(otherLines);
  if (clustered.length) return clustered;
  const firstExperienceHeading = parsed.lines.findIndex((line) => normalizeHeading(line) === 'experience');
  if (firstExperienceHeading >= 0) {
    const tail = parsed.lines.slice(firstExperienceHeading + 1);
    return tail.length ? tail : sectionLines;
  }
  // No explicit experience section — only fall back to collecting from all lines
  // when there are no well-defined sections at all (i.e. unstructured resume).
  // If other sections exist (education, projects, skills), the resume is structured
  // but simply has no experience; don't misinterpret project/education content.
  const definedSections = Object.keys(parsed.sections).filter((k) => k !== 'unmapped');
  if (definedSections.length > 0) {
    // Structured resume with no experience section — return empty to avoid false positives
    return [];
  }
  const allLines = Object.values(parsed.sections).flat();
  return collectLikelyExperienceLines(allLines.length ? allLines : parsed.lines);
}

function looksLikeExperienceHeader(line: string) {
  const normalizedLine = normalizeLegacyBulletPrefix(line);
  if (!normalizedLine || normalizedLine.startsWith('-')) return false;
  const cleaned = cleanLooseText(normalizedLine);
  if (!cleaned) return false;
  // Skill subsection labels are not experience headers.
  if (SKILL_SUBSECTION_LABEL_RE.test(cleaned)) return false;
  const hasDate = isDateLine(cleaned);
  const stripped = stripDates(cleaned);
  const hasSubstanceAfterDates = stripped.replace(/[@|]/g, ' ').replace(/\s+/g, ' ').trim().length >= 3;
  const hasRole = looksLikeRole(cleaned);
  const hasCompany = looksLikeCompany(cleaned);
  const hasRoleCompanyPattern = Boolean(parseRoleCompanyPair(stripped));
  const hasDelimiter = /@|\sat\s|\s\|\s|\s-\s|\s—\s|\s–\s|â€”|â€“/i.test(cleaned);

  // New experiences must be role/company headers, not repeated bullet prefixes.
  if (hasDate) {
    return hasRoleCompanyPattern || (hasRole && hasCompany) || (hasDelimiter && hasRoleCompanyPattern);
  }
  return hasRoleCompanyPattern || (hasRole && hasCompany) || (hasRole && hasDelimiter && hasSubstanceAfterDates);
}

function parseExperienceHeader(line: string) {
  if (looksLikeEducationRoleLine(line)) return null;
  if (!looksLikeExperienceHeader(line)) return null;
  const dates = extractDates(line);
  const stripped = stripDates(line);
  const split = splitRoleCompany(stripped);
  const role = cleanLooseText(split.role);
  const company = cleanCompanyName(split.company);
  if (!role && !company) return null;
  return {
    company,
    role,
    startDate: dates.start,
    endDate: dates.end,
  };
}

function parseRoleWithOptionalDates(line: string, currentCompany: string) {
  if (looksLikeEducationRoleLine(line)) return null;
  const dates = extractDates(line);
  const stripped = cleanLooseText(stripDates(line));
  if (!stripped) return null;
  const split = splitRoleCompany(stripped);
  const role = cleanLooseText(split.role);
  const company = cleanCompanyName(split.company);
  if (company && role && looksLikeRoleTitle(role)) {
    return { company, role, startDate: dates.start, endDate: dates.end };
  }
  if (!currentCompany || !role || !looksLikeRole(role) || !looksLikeRoleTitle(role)) return null;
  return {
    company: cleanCompanyName(currentCompany),
    role,
    startDate: dates.start,
    endDate: dates.end,
  };
}

/**
 * Parse lines matching "Company (Location) (DateRange)" or "Company (DateRange)".
 *
 * Common in ATS-exported PDFs where the company, location, and dates appear
 * on a single line within parentheses:
 *   "Citi Corp (Pune, India) (Dec 2022 - Present)"
 *   "Infosys Limited (Pune) (Aug 2017 - Aug 2020)"
 *   "The Digital Group Infotech Pvt. Ltd (Pune) (Apr 2014 - Jul 2017)"
 *
 * Returns null if the line doesn't match this pattern.
 */
function parseCompanyLocationDateLine(line: string): { company: string; startDate: string; endDate: string } | null {
  // Match: text before first paren group, optional location paren, then date paren
  // Pattern: CompanyName (optional location) (dateRange)
  const match = line.match(
    /^(.+?)\s*(?:\([^)]*?\)\s*)*\(([^)]*(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\d{1,2}[/-]\d{4}|\b(?:19|20)\d{2})[^)]*)\)\s*$/i,
  );
  if (!match) return null;

  const beforeDateParen = line.substring(0, line.lastIndexOf('('));
  // Extract company name by stripping parenthesized location groups
  const companyRaw = beforeDateParen.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (!companyRaw) return null;

  const company = cleanCompanyName(companyRaw);
  if (!company || company.length < 2) return null;

  // Reject if the line looks like a role title rather than a company
  if (looksLikeRole(company) && !looksLikeCompany(company)) return null;

  const dateParenContent = match[2];
  const dates = extractDates(dateParenContent);
  return { company, startDate: dates.start, endDate: dates.end };
}

/**
 * Parse lines matching "CompanyName DateRange" — no parentheses, just a
 * company followed by a date range. This is how DOCX exports often render
 * the right-aligned dates in a two-column experience block.
 *
 *   "Citi Dec 2013 - Present"
 *   "Cognizant 2011 - 2013"
 *   "Acme Corp Jan 2020 - Dec 2022"
 *
 * Returns null if there isn't a date range OR the prefix isn't recognisably
 * a company name (we don't want to swallow descriptive sentences).
 */
function parseCompanyDateLine(line: string): { company: string; startDate: string; endDate: string } | null {
  if (!isDateLine(line)) return null;
  const dates = extractDates(line);
  if (!dates.start && !dates.end) return null;
  const prefix = cleanLooseText(stripDates(line));
  if (!prefix) return null;
  // The prefix must look like a company name. Reject if it carries role
  // keywords (otherwise "Senior Software Engineer Aug 2017 - Aug 2020" would
  // be misread as a company line — that pattern is handled elsewhere by the
  // role-with-dates branch).
  if (looksLikeRole(prefix)) return null;
  if (!looksLikeCompany(prefix)) {
    // Short single-token brand names ("Citi", "EY", "Cognizant") still count
    // even if they don't pass the multi-token title-case heuristic.
    const tokens = prefix.split(/\s+/).filter(Boolean);
    if (tokens.length !== 1) return null;
    if (!/^[A-Z][A-Za-z0-9&'.-]+$/.test(tokens[0]) && !/^[A-Z]{2,6}$/.test(tokens[0])) return null;
  }
  return { company: cleanCompanyName(prefix), startDate: dates.start, endDate: dates.end };
}

function parseCompanyHeading(line: string) {
  const stripped = cleanLooseText(stripDates(line));
  if (!stripped) return '';
  const locationWrappedCompany = stripped.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (locationWrappedCompany) {
    const companyWithNoLocation = cleanCompanyName(stripped);
    if (looksLikeCompany(companyWithNoLocation)) {
      return companyWithNoLocation;
    }
  }
  const split = splitRoleCompany(stripped);
  if (split.company && !split.role) {
    return cleanCompanyName(split.company);
  }
  if (looksLikeCompany(stripped) && !looksLikeRole(stripped)) {
    return cleanCompanyName(stripped);
  }
  return '';
}

function extractBulletLine(line: string) {
  const match = String(line || '').match(/^\s*[-*•·]\s*(.+)$/);
  if (!match) return '';
  return cleanLooseText(match[1] || '');
}

/**
 * Decide whether a non-bullet `next` line is a continuation of the
 * previous bullet `prev` (PDF wrap-around) rather than a new bullet.
 *
 * Heuristics, in order of decisiveness:
 *   1. If prev ends with a sentence terminator (.!?;), it's complete —
 *      treat next as a new bullet.
 *   2. If next starts with a capital letter and is reasonably long
 *      (>= 30 chars), it's likely a real new bullet someone forgot to
 *      bullet-prefix. Don't merge.
 *   3. If prev ends with a connector ("and", "or", "but", "of",
 *      "with", "to", "for", "in", "on") OR a comma, it's almost
 *      certainly a wrap. Merge.
 *   4. If next starts with a lowercase word OR a clear continuation
 *      ("relationships.", "and team productivity"), merge.
 *   5. Otherwise, keep as a separate bullet (false negative is safer
 *      than wrong-merge).
 */
export function shouldMergeWrappedLine(prev: string, next: string): boolean {
  const p = String(prev || '').trim();
  const n = String(next || '').trim();
  if (!p || !n) return false;
  // 1. Sentence-terminated previous → new bullet.
  if (/[.!?;]$/.test(p)) return false;
  // 2. Long capitalised next → new bullet (false-negative is safe).
  if (n.length >= 30 && /^[A-Z]/.test(n)) return false;
  // 3. Connector or comma at end of prev → almost certainly a wrap.
  if (/(?:^|\s)(and|or|but|of|with|to|for|in|on|the|a|an|by|from|into|at)$/i.test(p)) return true;
  if (p.endsWith(',')) return true;
  // 4. Lowercase start on next → continuation of the previous sentence.
  if (/^[a-z]/.test(n)) return true;
  // 5. Short next clauses ("relationships.", "fewer escalations.") that
  //    do start with a capital but are too short to stand alone — merge
  //    when prev didn't terminate.
  if (n.length <= 28) return true;
  return false;
}

/**
 * Final, path-independent pass over a block's highlights: re-join any adjacent
 * pair where the second is a wrapped continuation of the first (PDF line-wrap
 * or dropped-ligature splits like "...incomplete" + "elds in editable PDF..."
 * or "...requirements, non" + "functional requirements..."). Runs regardless
 * of which assembly path produced the highlights, so no fragment survives to
 * the editor as its own bullet.
 */
export function mergeWrappedHighlights(highlights: string[]): string[] {
  const out: string[] = [];
  for (const raw of highlights || []) {
    const next = String(raw || '').trim();
    if (!next) continue;
    const prev = out[out.length - 1];
    if (prev && shouldMergeWrappedLine(prev, next)) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${next.replace(/^\s+/, '')}`;
    } else {
      out.push(next);
    }
  }
  return out;
}

function cleanCompanyName(value: string) {
  const normalized = cleanLooseText(value);
  if (!normalized) return '';
  const noTrailingDelimiter = normalized
    .replace(/[|@-]\s*$/g, '')
    .replace(/\(([^)]+)\)\s*$/g, '')
    // Normalize trailing period after company abbreviations: "Inc." → "Inc"
    .replace(/\b(inc|ltd|corp|co|pvt|llc)\.\s*$/i, '$1')
    .trim();
  const parts = noTrailingDelimiter.split(',').map((part) => cleanLooseText(part)).filter(Boolean);
  if (parts.length >= 2 && looksLikeLocationFragment(parts.slice(1).join(' ')) && looksLikeCompany(parts[0])) {
    return parts[0];
  }
  return noTrailingDelimiter;
}

function looksLikeLocationFragment(value: string) {
  return /\b(remote|usa|united states|india|canada|uk|australia|singapore|pune|mumbai|bangalore|bengaluru|delhi|hyderabad|chennai|kolkata|noida|gurgaon|gurugram|new york|san francisco|london|berlin|tokyo)\b/i.test(value)
    || /\b[A-Z]{2}\b/.test(value);
}

function splitRoleCompany(line: string) {
  // Normalize pipe spacing so a delimiter pipe is recognised regardless of
  // surrounding whitespace. PDF extraction often drops the space on one side
  // ("Infosys Limited |Senior System Engineer"), which previously defeated the
  // " | " delimiter match and left the whole string mis-classified as the role.
  const normalized = cleanLooseText(line.replace(/\s*\|\s*/g, ' | ').replace(/\s{2,}/g, ' '));
  if (!normalized) return { role: '', company: '' };
  if (normalized.includes('@')) {
    const parts = normalized.split('@');
    if (parts.length === 2) {
      const role = cleanLooseText(parts[0]);
      const company = cleanCompanyName(parts[1]);
      // Reject splits where the role is just punctuation (e.g. "(" from "( @ FOO")
      // or where the company looks like an email TLD (e.g. "gmail.com" from email leak)
      if (hasMeaningfulText(role) && hasMeaningfulText(company)) {
        return { role, company };
      }
    }
  }
  if (/\sat\s/i.test(normalized)) {
    const parts = normalized.split(/\sat\s/i);
    if (parts.length === 2) {
      const role = cleanLooseText(parts[0]);
      const company = cleanCompanyName(parts[1]);
      if (hasMeaningfulText(role) && hasMeaningfulText(company)) {
        return { role, company };
      }
    }
  }

  // Try comma-based “Role, Company” split BEFORE dash-based splits.
  // ATS-exported PDFs use “AVP - Full Stack Engineer, Citi Corp” where the dash
  // is part of the role title and the comma separates role from company.
  if (normalized.includes(',')) {
    const lastCommaIdx = normalized.lastIndexOf(',');
    const left = cleanLooseText(normalized.substring(0, lastCommaIdx));
    const right = cleanLooseText(normalized.substring(lastCommaIdx + 1));
    if (left && right && looksLikeCompany(right) && !looksLikeLocationFragment(right) && looksLikeRole(left)) {
      return { role: left, company: cleanCompanyName(right) };
    }
  }

  for (const delimiter of [' — ', ' – ', ' - ', ' | ', ' â€” ']) {
    if (normalized.includes(delimiter)) {
      const parts = normalized.split(delimiter);
      if (parts.length >= 2) {
        const left = cleanLooseText(parts[0]);
        const right = cleanLooseText(parts.slice(1).join(delimiter));
        const leftLooksRole = looksLikeRole(left);
        const rightLooksRole = looksLikeRole(right);
        const leftLooksCompany = looksLikeCompany(left);
        const rightLooksCompany = looksLikeCompany(right);
        if (leftLooksCompany && rightLooksRole) return { role: right, company: cleanCompanyName(left) };
        if (rightLooksCompany && leftLooksRole) return { role: left, company: cleanCompanyName(right) };
        if (leftLooksRole && !rightLooksRole) return { role: left, company: cleanCompanyName(right) };
        if (rightLooksRole && !leftLooksRole) return { role: right, company: cleanCompanyName(left) };
        if (leftLooksCompany && !rightLooksCompany) return { role: right, company: cleanCompanyName(left) };
        if (rightLooksCompany && !leftLooksCompany) return { role: left, company: cleanCompanyName(right) };
        return { role: left, company: cleanCompanyName(right) };
      }
    }
  }
  if (looksLikeCompany(normalized)) return { role: '', company: cleanCompanyName(normalized) };
  return { role: normalized, company: '' };
}

function parseRoleCompanyPair(line: string) {
  const split = splitRoleCompany(line);
  const role = cleanLooseText(split.role);
  const company = cleanCompanyName(split.company);
  if (!role || !company) return null;
  if (!looksLikeRole(role) && !looksLikeRoleTitle(role)) return null;
  if (!looksLikeCompany(company)) return null;
  return { role, company };
}

function normalizeLegacyBulletPrefix(line: string) {
  const raw = String(line || '');
  if (!LEGACY_BULLET_PREFIX_RE.test(raw)) return raw;
  const stripped = raw.replace(LEGACY_BULLET_PREFIX_RE, '').trim();
  if (!stripped) return '';
  return `- ${stripped}`;
}

function looksLikeRole(line: string) {
  return ROLE_HINT_RE.test(line) || ASSOCIATE_ROLE_RE.test(line);
}

function looksLikeRoleTitle(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  if (cleaned.length > 80) return false;
  if (/[.!?]$/.test(cleaned)) return false;
  if (cleaned.includes(',')) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  if (!/^[A-Z]/.test(cleaned)) return false;
  // A role title doesn't start with an action verb (past-tense or gerund).
  // "Innovated an API component" or "Designed scalable systems" — both contain
  // a role hint ("developer", etc.) but are bullet sentences, not role titles.
  if (SENTENCE_OPENER_RE.test(cleaned)) return false;
  // A role title is mostly title-case tokens (e.g. "Senior Software Engineer",
  // "Lead UI Developer"). Reject lines whose words are predominantly lowercase
  // function words/verbs. Test the title-case shape on the role portion only
  // (strip trailing dates, delimiters, and parenthesised metadata so date
  // tokens / pipe separators don't drag the title-case ratio down).
  const titlePortion = stripDates(cleaned)
    .replace(/\|.*$/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\-–—]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const titleTokens = titlePortion.split(/\s+/).filter(Boolean);
  if (titleTokens.length === 0) return true;
  const STOPWORDS = new Set(['of', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'a', 'an', '&', 'de', 'la']);
  const significant = titleTokens.filter((w) => !STOPWORDS.has(w.toLowerCase()));
  if (significant.length === 0) return true;
  const titleCaseSignificant = significant.filter((w) => /^[A-Z][A-Za-z0-9&'./-]*$/.test(w) || /^[A-Z]{2,}$/.test(w));
  if (titleCaseSignificant.length < significant.length) return false;
  return true;
}

function looksLikeEducationRoleLine(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  if (!looksLikeEducationDegreeLine(cleaned)) return false;
  // "Associate Software Engineer" should NOT be treated as an education line.
  // If the line contains both an education-like keyword (e.g. "associate") AND
  // a role hint (e.g. "engineer"), it's a job title, not a degree.
  if (ROLE_HINT_RE.test(cleaned)) return false;
  // "Research Associate" is a job role — if it matches our associate-as-role pattern,
  // treat it as a role, not an education degree.
  if (ASSOCIATE_ROLE_RE.test(cleaned)) return false;
  return true;
}

function looksLikeEducationDegreeLine(line: string) {
  return /\b(b\.?e\.?|b\.?a\.?|b\.?s\.?|b\.?sc|bb\.?a|b\.?com|b\.?tech|m\.?e\.?|m\.?a\.?|m\.?s\.?|m\.?sc|m\.?tech|m\.?b\.?a|m\.?com|m\.?phil|bachelor|master|associate|diploma|ph\.?d\.?|phd|doctorate|d\.?b\.?a|b\.?c\.?a|m\.?c\.?a|b\.?b\.?a?|ll\.?b|ll\.?m|j\.?d\.?|d\.?o\.?|m\.?d\.?|ed\.?d|psych\.?d|b\.?des|m\.?des|b\.?arch|m\.?arch|b\.?pharm|m\.?pharm|b\.?ed|m\.?ed|b\.?f\.?a|m\.?f\.?a|b\.?voc|b\.?p\.?t|m\.?p\.?t)\b/i.test(line);
}

function looksLikeEducationInstitutionLine(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  // Match explicit institution words
  if (/\b(university|college|school|institute|academy|polytechnic|conservatory)\b/i.test(cleaned)) return true;
  // Match common Indian institution abbreviations (IIT, IIIT, NIT, BITS, etc.)
  if (/\b(IIT|IIIT|NIT|BITS|SPPU|VTU|JNTU|AKTU|MIT|DTU|NSIT)\b/.test(cleaned)) return true;
  // Reject dates, degrees, short abbreviations, and bullet points
  if (cleaned.length < 3) return false;
  if (isStandaloneDateLine(cleaned)) return false;
  if (looksLikeEducationDegreeLine(cleaned)) return false;
  if (/^[-•*]/.test(cleaned)) return false;
  // Reject sentence-style bullets that leak into the education section from
  // an adjacent ACHIEVEMENTS / SUMMARY block. These start with an action
  // verb (Led, Built, Spearheaded, Launched, …) and would otherwise pass
  // the title-case heuristic below.
  if (SENTENCE_OPENER_RE.test(cleaned)) return false;
  // Lines that end with a period are sentence-shaped descriptions, not
  // institution names — unless they contain an explicit institution word
  // (already handled above).
  if (/\.\s*$/.test(cleaned)) return false;
  // Reject lines that look like job role titles or company names — in multi-page
  // PDFs, experience entries can spill into the education section after page breaks.
  // e.g. "Senior Technology Consultant", "Lead UI Developer" are roles, not institutions.
  // e.g. "Ernst & Young (Pune, Maharashtra)", "Infosys Ltd" are companies, not institutions.
  if (looksLikeRole(cleaned) && !/(university|college|school|institute|academy)\b/i.test(cleaned)) return false;
  if (looksLikeCompany(cleaned) && !/(university|college|school|institute|academy)\b/i.test(cleaned)) return false;
  // Title-case line within an education section that isn't a degree or date
  // is likely an institution name (e.g. "SPPU", "IIT Delhi", "Harvard")
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 8) {
    const titleCaseWords = words.filter((w: string) => /^[A-Z]/.test(w));
    if (titleCaseWords.length >= Math.ceil(words.length * 0.5)) return true;
  }
  return false;
}

function looksLikeCompany(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  // Lines ending with a period are sentence-like descriptions, not company names
  // Exception: company abbreviations like "Inc.", "Ltd.", "Corp.", "Pvt.", "Co."
  if (/\.\s*$/.test(cleaned) && !/\b(inc|ltd|corp|co|pvt|llc)\.\s*$/i.test(cleaned)) return false;
  // "Technologies - HTML, CSS, ..." or "Technologies: ..." is NOT a company
  if (/^Technologies\s*[-:]/i.test(cleaned)) return false;
  // Skill subsection labels ("Soft Skills:", "TECHNICAL SKILLS - ...") are never companies.
  if (SKILL_SUBSECTION_LABEL_RE.test(cleaned)) return false;
  // Standalone skill-related labels (e.g. "Soft Skills", "SOFT SKILLS", "Technical Skills")
  // collapse to a known title in TITLE_BLOCKLIST after normalization.
  const normalizedTitle = cleaned.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalizedTitle && TITLE_BLOCKLIST.has(normalizedTitle)) return false;
  // Reject sentence-prose: lines that start with a lowercase verb/preposition
  // or a present-participle ("ensuring alignment with company") are descriptions,
  // not company names. Real company names start with an uppercase letter,
  // a digit, or punctuation like "&".
  if (!/^[A-Z0-9&(]/.test(cleaned)) return false;
  // Reject lines that start with an action verb. Real company names don't.
  if (SENTENCE_OPENER_RE.test(cleaned)) return false;
  if (looksLikeRole(cleaned)) {
    // "Systems Engineer", "Systems Analyst", etc. are role titles, not companies
    if (/\bsystems?\s+(?:engineer|developer|analyst|administrator|architect|specialist)\b/i.test(cleaned)) {
      return false;
    }
    if (!/(inc|llc|ltd|corp|company|technologies|systems|labs|solutions|group|studio|partners|bank|university|health|consulting|digital)\b/i.test(cleaned)) {
      return false;
    }
  }
  if (/(inc|llc|ltd|corp|company|technologies|systems|labs|solutions|group|studio|partners|bank|university|health|consulting|digital)\b/i.test(cleaned)) {
    // Guard: long sentence-like lines that incidentally contain suffix words
    // (e.g. "Designed distributed systems handling 1M concurrent users") are
    // NOT company names. Real company names rarely exceed 6 words.
    const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
    if (wordCount > 6) return false;
    // Even short lines like "ensuring alignment with company" pass the word-count
    // guard but are still prose. Require at least half the non-stopword tokens
    // to be title-case (i.e. starting with an uppercase letter), so we accept
    // "Citi Group" or "Bank of America" but reject "alignment with company".
    const STOPWORDS = new Set(['of', 'the', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'a', 'an', '&', 'de', 'la']);
    const tokens = cleaned.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
    const significant = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
    if (significant.length === 0) return false;
    const titleCase = significant.filter((t) => /^[A-Z]/.test(t) || /^[A-Z0-9&]+$/.test(t)).length;
    if (titleCase < Math.ceil(significant.length * 0.5)) return false;
    return true;
  }
  // Short ALL-CAPS abbreviations (2-6 chars) are common company names
  // e.g. TCS, IBM, SAP, HCL, KPMG, EY — but not role abbreviations like AVP, CTO, CEO
  if (/^[A-Z]{2,6}$/.test(cleaned) && !ROLE_HINT_RE.test(cleaned) && !ASSOCIATE_ROLE_RE.test(cleaned)) return true;
  // Reject "City, ST" / "City, Country" / "City, State" location-only lines —
  // LinkedIn / Indeed PDF exports put a location line right under the date,
  // and we don't want it to look like a company.
  if (looksLikePureLocation(cleaned)) return false;
  // Handle "Company, Location" pattern (e.g. "Ernst & Young, Pune")
  const commaParts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  const mainPart = commaParts.length >= 2 ? commaParts[0] : cleaned;
  const tokens = mainPart.split(/\s+/).filter(Boolean);
  if (tokens.length >= 1 && tokens.length <= 7) {
    const titleCaseTokens = tokens.filter((token) => /^[A-Z][A-Za-z0-9&'.-]*$/.test(token) || /^&$/.test(token)).length;
    // Single-token brand names (e.g. "Contoso", "Citi", "Cognizant", "Stripe")
    // are valid company names provided the token is title-case and at least
    // 3 letters long so we don't pick up role abbreviations like "VP".
    if (tokens.length === 1) {
      return titleCaseTokens === 1 && tokens[0].length >= 3 && !ROLE_HINT_RE.test(tokens[0]) && !ASSOCIATE_ROLE_RE.test(tokens[0]);
    }
    return titleCaseTokens >= Math.ceil(tokens.length * 0.6);
  }
  return false;
}

/**
 * Detect "Pure location" lines like "San Francisco, CA", "London, UK",
 * "Pune, Maharashtra, India". These follow the date in LinkedIn exports and
 * would otherwise be misread as a company name.
 */
function looksLikePureLocation(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  // Must contain a comma — "City, State" / "City, Country" shape.
  if (!cleaned.includes(',')) return false;
  // Must not contain a company-suffix word.
  if (/(inc|llc|ltd|corp|company|technologies|systems|labs|solutions|group|studio|partners|bank|consulting|digital|enterprises|pvt|limited|infotech)\b/i.test(cleaned)) return false;
  // Each comma-separated part must look like a place: at least one must match
  // our known-location regex, and the others must be short title-case tokens
  // (state names like "California", or 2-letter codes like "CA", "UK").
  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  const knownLocation = parts.some((p) => looksLikeLocationFragment(p));
  if (!knownLocation) return false;
  const everyPartLooksGeographic = parts.every((p) => {
    if (looksLikeLocationFragment(p)) return true;
    // Two-letter state/country code (CA, NY, UK, DE)
    if (/^[A-Z]{2}$/.test(p)) return true;
    // Short title-case place name like "Maharashtra" or "California"
    const tokens = p.split(/\s+/).filter(Boolean);
    if (tokens.length > 3) return false;
    return tokens.every((t) => /^[A-Z][a-z]+$/.test(t));
  });
  return everyPartLooksGeographic;
}

function mergeExperienceByCompany(experience: ExperienceItem[]) {
  const map = new Map<string, ExperienceItem>();
  for (const item of experience) {
    if (!isMeaningfulExperience(item)) continue;
    const company = cleanCompanyName(item.company);
    const role = cleanLooseText(item.role);
    const startDate = normalizeDateToken(cleanLooseText(item.startDate));
    const endDate = normalizeDateToken(cleanLooseText(item.endDate));
    // Use normalized keys for fuzzy matching: strip suffixes like "Inc", "Ltd", etc.
    const companyKey = normalizeCompany(company);
    const roleKey = role.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${companyKey}|${roleKey}|${startDate}|${endDate}`;
    // Also check for near-duplicate: same company+role but different dates (merge highlights)
    const fuzzyKey = `${companyKey}|${roleKey}`;
    if (!map.has(key)) {
      // Check for fuzzy duplicate (same company+role, overlapping or adjacent dates)
      let merged = false;
      for (const [existingKey, existing] of map.entries()) {
        if (existingKey.startsWith(fuzzyKey + '|')) {
          // Same company and role - check if dates overlap or are adjacent
          if (datesOverlapOrAdjacent(existing.startDate, existing.endDate, startDate, endDate)) {
            existing.startDate = pickEarlierDate(existing.startDate, startDate);
            existing.endDate = pickLaterDate(existing.endDate, endDate);
            existing.highlights = uniqueLines([...existing.highlights, ...item.highlights.map((line: string) => cleanLooseText(line)).filter(Boolean)]);
            merged = true;
            break;
          }
        }
      }
      if (!merged) {
        map.set(key, {
          ...item,
          company,
          role,
          startDate,
          endDate,
          highlights: uniqueLines(item.highlights.map((line: string) => cleanLooseText(line)).filter(Boolean)),
        });
      }
      continue;
    }
    const current = map.get(key)!;
    current.role = current.role || role;
    current.company = current.company || company;
    current.startDate = pickEarlierDate(current.startDate, startDate);
    current.endDate = pickLaterDate(current.endDate, endDate);
    current.highlights = uniqueLines([...current.highlights, ...item.highlights.map((line: string) => cleanLooseText(line)).filter(Boolean)]);
    map.set(key, current);
  }
  return Array.from(map.values());
}

function datesOverlapOrAdjacent(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = toSortValue(start1, false);
  const e1 = toSortValue(end1 || start1, true);
  const s2 = toSortValue(start2, false);
  const e2 = toSortValue(end2 || start2, true);
  if (!s1 && !e1 && !s2 && !e2) return true; // Both undated = likely same
  if ((!s1 && !e1) || (!s2 && !e2)) return false; // One undated, one dated
  // Check overlap or adjacency (within 2 months)
  return !(e1 + 2 < s2 || e2 + 2 < s1);
}

function sortExperienceChronological(experience: ExperienceItem[]) {
  const sorted = [...experience];
  sorted.sort((a, b) => {
    const endA = toSortValue(a.endDate || a.startDate, true);
    const endB = toSortValue(b.endDate || b.startDate, true);
    if (endB !== endA) return endB - endA;
    return toSortValue(b.startDate, false) - toSortValue(a.startDate, false);
  });
  return sorted;
}

function isDateLine(line: string) {
  const hasYear = /(\b(20\d{2}|19\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b)/i.test(line);
  if (!hasYear) return false;
  // Check for date range separator: “ - “, “ to “, em-dash, en-dash, etc.
  if (/\s+-\s+|\bto\b|–|—|â€”|â€”/i.test(line)) return true;
  // YYYY-MM - YYYY-MM format (dashes within dates and between dates)
  if (/\b(20\d{2}|19\d{2})[-/]\d{1,2}\b.*\s+-\s+.*\b(20\d{2}|19\d{2})/i.test(line)) return true;
  // MM/YYYY - MM/YYYY format
  if (/\b\d{1,2}[/-](20\d{2}|19\d{2})\b.*\s+-\s+.*\b\d{1,2}[/-](20\d{2}|19\d{2})/i.test(line)) return true;
  return false;
}

function isStandaloneDateLine(line: string) {
  if (!isDateLine(line)) return false;
  const stripped = cleanLooseText(
    stripDates(line)
      .replace(/\b(to|till|until|through)\b/gi, '') // remove date range separators
      .replace(/\|\s*[\w\s,]+$/i, '') // remove trailing pipe-separated location (e.g. "| Pune, Maharashtra")
  );
  if (!stripped) return true;
  return !/[a-z0-9]/i.test(stripped);
}

function isCrossSectionBoundary(line: string) {
  return /--\s*\d+\s*of\s*\d+\s*--\s*(education|projects?|certifications?|licenses?|skills?|hobbies|languages?|achievements?)\b/i.test(line);
}

function extractDates(line: string) {
  const dateToken = '(?:' +
    '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\s+\\d{4}' +
    '|\\b(?:19|20)\\d{2}[-/]\\d{1,2}\\b' +     // YYYY-MM or YYYY/MM format
    '|\\b\\d{1,2}[/-](?:19|20)\\d{2}\\b' +      // MM/YYYY or MM-YYYY format
    '|\\b(?:19|20)\\d{2}\\b' +                   // bare YYYY (must be last to not consume YYYY-MM)
    ')';
  // Use “ - “ (with spaces) or “to” or em/en-dash as range separator to avoid
  // matching the “-” inside YYYY-MM tokens
  const rangePattern = new RegExp(`(${dateToken})\\s*(?:\\s-\\s|\\bto\\b|–|—|â€”|â€”)\\s*((?:present|current|now|till\\s*date)|${dateToken})?`, 'i');
  const match = line.match(rangePattern);
  // Also handle bare YYYY-YYYY (no spaces around dash, e.g. “2017-2020”)
  if (!match) {
    const bareRange = line.match(/\b((?:19|20)\d{2})-((?:19|20)\d{2})\b/);
    if (bareRange) return { start: normalizeDateToken(bareRange[1]), end: normalizeDateToken(bareRange[2]) };
    return { start: '', end: '' };
  }
  return {
    start: normalizeDateToken(match[1]),
    end: normalizeDateToken(match[2] || ''),
  };
}

function normalizeDateToken(token: string) {
  if (!token) return '';
  const clean = token.replace(/\u2013|\u2014/g, '-').trim();
  if (/present|current|now|till\s*date/i.test(clean)) return 'Present';
  return clean;
}

function stripDates(line: string) {
  return line
    .replace(/\b(19\d{2}|20\d{2})[-/]\d{1,2}\b/gi, '')   // YYYY-MM
    .replace(/\b\d{1,2}[/-](19\d{2}|20\d{2})\b/gi, '')   // MM/YYYY
    .replace(/\b(20\d{2}|19\d{2})\b/g, '')                // bare YYYY
    // Strip month names — match abbreviation OR full form. We avoid the
    // permissive "[a-z]*" suffix because with the /i flag it also matches
    // uppercase letters and eats half of words like "NovaCorp" / "Marshalls"
    // / "Junkers", silently corrupting non-date text.
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi, '')
    .replace(/\b(present|current|now|till\s*date)\b/gi, '')
    .replace(/[-–—â€”â€”|@]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksLikeProjectTitle(line: string) {
  const cleaned = cleanLooseText(line);
  if (!cleaned) return false;
  if (!/\b(project|capstone|thesis|research)\b/i.test(cleaned)) return false;
  // Sentence-style bullets (e.g. "Launched ... the innovative SpeedBoat project, ...")
  // happen to contain the word "project" but are NOT new project titles. Reject:
  // - long lines (real titles fit in a single short phrase)
  // - lines that open with an action verb / past participle
  // - lines ending with a comma (wrapped continuation of a bullet)
  // - lines starting with a lowercase word (a wrapped sentence continuation,
  //   never a title — real project titles are Title-Cased)
  if (cleaned.length > 80) return false;
  if (SENTENCE_OPENER_RE.test(cleaned)) return false;
  if (/,\s*$/.test(cleaned)) return false;
  if (!/^[A-Z0-9"']/.test(cleaned)) return false;
  return true;
}

function isMeaningfulHighlight(line: string) {
  return /[a-z0-9]/i.test(line) && !/^[-–—_*•·|/\\]+$/.test(line);
}

function isMeaningfulExperience(item: ExperienceItem) {
  return Boolean(item.company.trim() || item.role.trim() || item.startDate.trim() || item.endDate.trim() || item.highlights.some((line: string) => line.trim().length > 0));
}

function uniqueLines(lines: string[]) {
  const set = new Set<string>();
  const out: string[] = [];
  for (const line of lines.map((line) => line.trim()).filter(Boolean)) {
    const key = line.toLowerCase();
    if (set.has(key)) continue;
    set.add(key);
    out.push(line);
  }
  return out;
}

function normalizeCompany(company: string) {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickEarlierDate(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return toSortValue(a, false) <= toSortValue(b, false) ? a : b;
}

function pickLaterDate(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  if (/present/i.test(a)) return a;
  if (/present/i.test(b)) return b;
  return toSortValue(a, true) >= toSortValue(b, true) ? a : b;
}

function toSortValue(token: string, end: boolean) {
  const parsed = parseDateToken(token, end);
  if (!parsed) return 0;
  return parsed.year * 100 + parsed.month;
}

function parseDateToken(token: string, end: boolean) {
  if (!token) return null;
  if (/present|current|now/i.test(token)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const clean = token.toLowerCase().trim();
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const monthYear = clean.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})/);
  if (monthYear) {
    const month = monthMap[monthYear[1].slice(0, 4)] || monthMap[monthYear[1].slice(0, 3)] || 1;
    return { year: Number(monthYear[2]), month };
  }
  // YYYY-MM format (ISO-style, e.g. "2010-01")
  const yearMonthIso = clean.match(/\b(19\d{2}|20\d{2})[-/](\d{1,2})\b/);
  if (yearMonthIso) {
    return { year: Number(yearMonthIso[1]), month: Math.max(1, Math.min(12, Number(yearMonthIso[2]))) };
  }
  // MM/YYYY or MM-YYYY format
  const monthYearNumeric = clean.match(/\b(\d{1,2})[-/](19\d{2}|20\d{2})\b/);
  if (monthYearNumeric) {
    return { year: Number(monthYearNumeric[2]), month: Math.max(1, Math.min(12, Number(monthYearNumeric[1]))) };
  }
  const year = clean.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) {
    return { year: Number(year[1]), month: end ? 12 : 1 };
  }
  return null;
}



