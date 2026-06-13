/**
 * Single source of truth for JD-side stopwords. Every code path that
 * extracts "keywords from the job description" — the ATS scorer
 * (resume.service), the AI critique fallback, the tech-gap rule-based
 * analysis, the public /v1/score endpoint — runs tokens through this
 * filter. Without it, generic English filler ("have", "you", "must",
 * "experienced") ends up in the user's "missing keywords" list, which
 * the founder repeatedly reported during smoke tests.
 *
 * Two layers:
 *   - JD_STOPWORDS    — generic English filler, modals, auxiliaries,
 *                       JD meta-words ("candidate", "role", "looking",
 *                       "experience" the noun, etc.).
 *   - SECTION_LABELS  — words that name resume sections themselves
 *                       ("skills", "experience", "education"). These
 *                       are NEVER keywords the user is missing — the
 *                       presence of the section is enforced separately.
 *
 * Both lists are explicit on purpose. Skill/role nouns (react,
 * kubernetes, leadership, frontend, distributed, systems, ...) are
 * deliberately not included so they still surface as legitimate
 * missing-keyword candidates.
 */

export const JD_STOPWORDS: ReadonlySet<string> = new Set([
  // articles / determiners / pronouns
  'the', 'and', 'with', 'for', 'you', 'our', 'are', 'will', 'from', 'that', 'this',
  'your', 'their', 'they', 'them', 'these', 'those', 'such', 'each', 'any', 'all',
  'his', 'her', 'its', 'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'how',
  // auxiliaries / modals / common tenses
  'have', 'has', 'had', 'having', 'be', 'is', 'was', 'were', 'been', 'being',
  'do', 'does', 'did', 'doing', 'done',
  'can', 'cant', 'could', 'should', 'shouldn', 'must', 'mustn', 'may', 'might',
  'would', 'wouldnt', 'shall', 'shant', 'ought', 'past', 'present', 'future',
  // generic JD verbs / meta words
  'understand', 'understanding', 'requires', 'required', 'requirement', 'requirements',
  'need', 'needs', 'needed', 'including', 'includes', 'includ', 'across',
  'looking', 'seeking', 'hiring', 'apply', 'role', 'roles', 'position', 'positions',
  'opportunity', 'opportunities', 'candidate', 'candidates', 'applicant', 'applicants',
  'responsibilities', 'duties', 'qualifications', 'qualified', 'preferred',
  'experience', 'experienced', 'background', 'knowledge', 'familiar', 'familiarity',
  'ability', 'able', 'skilled', 'expertise',
  'working', 'work', 'works', 'worked', 'team', 'teams', 'company', 'companies',
  'people', 'individuals', 'person', 'someone', 'others',
  // generic vague verbs that bloat extractor output
  'help', 'helping', 'helped', 'support', 'supporting', 'ensure', 'ensuring',
  'within', 'about', 'into', 'onto', 'over', 'under', 'than', 'then',
  'while', 'whereas', 'because', 'between', 'among', 'against', 'following',
  'real', 'good', 'great', 'strong', 'solid', 'proven', 'demonstrated',
  // pronouns + glue
  'we', 'us', 'i', 'me', 'my', 'mine', 'an',
]);

/**
 * Words that name resume sections themselves — they're not "missing
 * skills", the section's existence is enforced by the sections-
 * completeness check. Surfacing 'skills' as a "missing skill" in the
 * AI Critique is the most embarrassing failure mode.
 */
export const SECTION_LABEL_WORDS: ReadonlySet<string> = new Set([
  'skills', 'skill', 'experience', 'education', 'summary', 'objective',
  'projects', 'project', 'certifications', 'certification', 'achievements',
  'achievement', 'languages', 'language', 'hobbies', 'interests', 'profile',
]);

/** True if a token should be excluded from any "missing keywords" surface. */
export function isJdStopword(token: string): boolean {
  if (!token) return true;
  if (token.length < 3) return true;
  const t = token.toLowerCase();
  return JD_STOPWORDS.has(t) || SECTION_LABEL_WORDS.has(t);
}

/**
 * Filter a list of candidate JD keywords down to legitimate role/skill
 * terms. Used by every "missing keywords" surface so the lists agree.
 */
export function filterJdKeywords(candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const t = String(raw || '').trim().toLowerCase();
    if (!t || isJdStopword(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
