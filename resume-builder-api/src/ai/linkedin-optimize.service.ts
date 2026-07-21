import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimitOrThrow } from '../limits/rate-limit';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { XaiProvider } from './providers/xai.provider';
import { enforceResumeAiFreeDaily, recordResumeAiFreeUsage, resolveResumeAiProvider } from './resume-ai-access';
import { normalizeLinkedInProfileText, looksLikeLinkedInProfile } from '../resume/linkedin-import';
import { analyzeActionVerbRule } from '../resume/action-verb-rule';

/**
 * LinkedIn Profile Optimizer — an editor-adjacent AI tool.
 *
 * A user pastes their LinkedIn profile text and gets a section-by-section
 * scorecard (Headline / About / Experience / Skills) plus concrete,
 * actionable findings. This is Careerflow's signature feature; our
 * differentiator is the HONESTY layer — the AI enhancement is STRICTLY
 * grounded in the pasted profile and forbidden from inventing employers,
 * titles, numbers, or skills the person doesn't already demonstrate.
 *
 * A rule-based baseline ALWAYS runs (no AI needed) so the feature works
 * even when GROQ is misconfigured. When a provider resolves, the LLM
 * refines the headline, rewrites the About, and suggests skills — merged
 * into the response as suggested* fields. Any failure falls back cleanly
 * to the rule-based result.
 *
 * AI access reuses the resume-page policy (R-086) exactly, via
 * resolveResumeAiProvider: BYOK → own key (uncapped); ₹499 plan → OUR key
 * (uncapped); FREE → OUR key, capped to N actions/user/day (shared bucket
 * across every resume/editor AI button via enforceResumeAiFreeDaily).
 */

export type LinkedInOptimizeInput = {
  profileText: string;
};

export type LinkedInFinding = {
  severity: 'good' | 'warn' | 'critical';
  message: string;
  fix: string;
};

export type LinkedInSectionScore = {
  name: 'Headline' | 'About' | 'Experience' | 'Skills';
  score: number;
  findings: LinkedInFinding[];
};

export type LinkedInOptimizeResult = {
  overallScore: number;
  band: 'strong' | 'decent' | 'needs-work';
  sections: LinkedInSectionScore[];
  suggestedHeadline?: string;
  suggestedAbout?: string;
  suggestedSkills?: string[];
  provider: 'groq' | 'rule-based';
};

/** Cap input so a giant paste can't blow up the token budget. */
const MAX_INPUT_CHARS = 15_000;

const HEADLINE_MAX = 220;
const ABOUT_MIN = 40;
const ABOUT_MAX = 2000;
const MIN_SKILLS = 5;

/**
 * The brand promise, in the system prompt. We ONLY claim "never invents
 * facts" (C-003) because this instruction actually constrains the model —
 * and on any parse/timeout failure we drop the AI layer entirely rather
 * than surface something ungrounded.
 */
const SYSTEM_PROMPT = [
  'You are a LinkedIn profile coach. You improve the wording of a profile the user pastes.',
  '',
  'ABSOLUTE HONESTY RULE (non-negotiable):',
  '  Do NOT invent employers, job titles, dates, metrics, numbers, achievements, or skills',
  '  the person does not already demonstrate in the pasted text. You may only rephrase,',
  '  tighten, and reorganize what is genuinely there. If the profile lacks a metric, do not',
  '  fabricate one — write the stronger sentence WITHOUT a number. Suggested skills must be',
  '  skills the pasted profile already evidences, never aspirational additions.',
  '',
  'TASK: Given the profile text, return JSON (and nothing else) with this exact shape:',
  '{',
  '  "suggestedHeadline": "one improved headline, <= 220 chars, role + value, no fabrication",',
  '  "suggestedAbout": "a rewritten About/summary, first-person, 40-2000 chars, grounded only in the text",',
  '  "suggestedSkills": ["5 skills the profile already demonstrates"]',
  '}',
].join('\n');

@Injectable()
export class LinkedInOptimizeService {
  private readonly logger = new Logger(LinkedInOptimizeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async optimize(
    userId: string,
    input: LinkedInOptimizeInput,
    byok?: { provider?: string | null; key?: string | null; model?: string | null },
  ): Promise<LinkedInOptimizeResult> {
    const raw = String(input?.profileText || '').slice(0, MAX_INPUT_CHARS);
    if (raw.trim().length < 20) {
      throw new ForbiddenException('Paste your LinkedIn profile text — we need something to analyze.');
    }

    rateLimitOrThrow({
      key: `ai:linkedin-optimize:${userId}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Rate limit exceeded for LinkedIn Optimizer. Try again shortly.',
    });

    // Clean up LinkedIn's parser-hostile paste (doubled lines, "· Full-time"
    // tails, app chrome) when it looks like a LinkedIn profile; otherwise
    // analyze the text as-is.
    const cleaned = looksLikeLinkedInProfile(raw) ? normalizeLinkedInProfileText(raw) : raw.trim();
    const sections = splitProfileSections(cleaned);

    // Rule-based baseline ALWAYS runs first — the feature never dead-ends.
    const baseline = buildRuleBasedScorecard(sections);

    // Resume-editor-adjacent AI feature: same gating + daily bucket as Tech
    // Gap / JD Match (R-086). BYOK / plan uncapped; FREE capped per day.
    const { provider, source } = await resolveResumeAiProvider(
      this.prisma, userId, byok, () => this.resolveProvider(),
    );
    const freeDaily = source === 'free';

    if (!provider) {
      return baseline;
    }

    if (freeDaily) {
      await enforceResumeAiFreeDaily(this.prisma, this.config, userId);
    }

    const userPrompt = [
      sections.headline ? `HEADLINE:\n${sections.headline}` : 'HEADLINE:\n(none)',
      sections.about ? `\nABOUT:\n${sections.about}` : '\nABOUT:\n(none)',
      sections.experience ? `\nEXPERIENCE:\n${sections.experience}` : '',
      sections.skills.length ? `\nSKILLS:\n${sections.skills.join(', ')}` : '',
      '\nReturn the JSON described above. Ground every word in the text above; invent nothing.',
    ].filter(Boolean).join('\n');

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
      const rawResponse = await provider.complete(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs,
      });
      const suggestions = parseSuggestions(rawResponse);
      if (!suggestions) {
        return baseline;
      }
      if (freeDaily) {
        await recordResumeAiFreeUsage(this.prisma, userId);
      }
      return {
        ...baseline,
        suggestedHeadline: suggestions.suggestedHeadline || undefined,
        suggestedAbout: suggestions.suggestedAbout || undefined,
        suggestedSkills: suggestions.suggestedSkills?.length ? suggestions.suggestedSkills : undefined,
        provider: 'groq',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LinkedIn optimize AI failed (provider=${provider.name}): ${msg}`);
      return baseline;
    }
  }

  private resolveProvider(): AiProvider | null {
    const name = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (name === 'xai') {
      const key = this.config.get<string>('XAI_API_KEY', '');
      return key ? new XaiProvider(key, this.config.get<string>('XAI_MODEL', '') || undefined) : null;
    }
    const key = this.config.get<string>('GROQ_API_KEY', '');
    return key ? new GroqProvider(key, this.config.get<string>('GROQ_MODEL', '') || undefined) : null;
  }
}

// ── Helpers (exported for tests) ────────────────────────────────────

export type LinkedInSections = {
  headline: string;
  about: string;
  experience: string;
  skills: string[];
};

const SECTION_HEADINGS: Array<[RegExp, keyof LinkedInSections]> = [
  [/^(summary|about)\b/i, 'about'],
  [/^(work\s+experience|experience|employment)\b/i, 'experience'],
  [/^(skills|top\s+skills|core\s+competenc)/i, 'skills'],
];

/**
 * Heuristic section split. The first non-empty content line (before any
 * recognized heading) is treated as the Headline. After that, simple
 * heading detection routes text into About / Experience / Skills buckets.
 */
export function splitProfileSections(text: string): LinkedInSections {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const sections: LinkedInSections = { headline: '', about: '', experience: '', skills: [] };
  const buckets: Record<'about' | 'experience' | 'skills', string[]> = { about: [], experience: [], skills: [] };

  let current: 'headline' | 'about' | 'experience' | 'skills' = 'headline';
  let headlineTaken = false;

  for (const line of lines) {
    if (!line) continue;

    const heading = SECTION_HEADINGS.find(([re]) => re.test(line));
    // A short line that IS a heading (not a sentence that happens to start
    // with the word) switches the current bucket.
    if (heading && line.length <= 40) {
      current = heading[1];
      headlineTaken = true; // once we hit a heading, the headline window closed
      continue;
    }

    if (current === 'headline') {
      if (!headlineTaken) {
        sections.headline = line;
        headlineTaken = true;
        current = 'about';
      }
      continue;
    }

    buckets[current].push(line);
  }

  sections.about = buckets.about.join('\n').trim();
  sections.experience = buckets.experience.join('\n').trim();
  sections.skills = splitSkills(buckets.skills.join('\n'));
  return sections;
}

function splitSkills(text: string): string[] {
  return String(text || '')
    .split(/[\n,·•|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60);
}

/** Extract bullet-like lines from the experience blob for verb analysis. */
export function extractExperienceBullets(experience: string): string[] {
  return String(experience || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 12 && /[a-z]/i.test(l))
    .slice(0, 40);
}

const ROLE_KEYWORDS = /\b(engineer|developer|manager|designer|analyst|scientist|architect|consultant|lead|director|specialist|marketer|founder|product|data|software|full[- ]?stack|frontend|backend|devops|qa|sre|writer|recruiter|accountant|sales|strategist|coordinator|administrator|intern)\b/i;

export function buildRuleBasedScorecard(sections: LinkedInSections): LinkedInOptimizeResult {
  const headline = scoreHeadline(sections.headline);
  const about = scoreAbout(sections.about);
  const experience = scoreExperience(sections.experience);
  const skills = scoreSkills(sections.skills);

  const allSections = [headline, about, experience, skills];
  const overallScore = Math.round(allSections.reduce((sum, s) => sum + s.score, 0) / allSections.length);

  return {
    overallScore,
    band: overallScore >= 75 ? 'strong' : overallScore >= 50 ? 'decent' : 'needs-work',
    sections: allSections,
    provider: 'rule-based',
  };
}

function scoreHeadline(headline: string): LinkedInSectionScore {
  const findings: LinkedInFinding[] = [];
  let score = 100;
  const text = headline.trim();

  if (!text) {
    score = 0;
    findings.push({
      severity: 'critical',
      message: 'No headline detected.',
      fix: 'Add a headline with your role and the value you bring, e.g. "Backend Engineer | Payments & Distributed Systems".',
    });
    return { name: 'Headline', score, findings };
  }

  if (text.length > HEADLINE_MAX) {
    score -= 30;
    findings.push({
      severity: 'warn',
      message: `Headline is ${text.length} characters — over the ${HEADLINE_MAX} LinkedIn limit.`,
      fix: 'Trim to the essentials: role, specialty, and one differentiator.',
    });
  }
  if (!ROLE_KEYWORDS.test(text)) {
    score -= 35;
    findings.push({
      severity: 'warn',
      message: 'Headline has no clear role keyword — recruiters and search miss you.',
      fix: 'Lead with your role (e.g. "Product Manager", "Data Analyst") so you surface in searches.',
    });
  }
  if (text.length < 30) {
    score -= 20;
    findings.push({
      severity: 'warn',
      message: 'Headline is very short — it wastes prime search real estate.',
      fix: 'Add a specialty or an outcome: "…helping fintechs ship secure APIs".',
    });
  }
  if (!findings.length) {
    findings.push({ severity: 'good', message: 'Headline is present, keyword-rich, and within length.', fix: '' });
  }
  return { name: 'Headline', score: clamp(score), findings };
}

function scoreAbout(about: string): LinkedInSectionScore {
  const findings: LinkedInFinding[] = [];
  let score = 100;
  const text = about.trim();

  if (!text) {
    return {
      name: 'About',
      score: 0,
      findings: [{
        severity: 'critical',
        message: 'No About/summary section found.',
        fix: 'Add a 3-5 sentence summary: who you are, what you do, and the impact you have had.',
      }],
    };
  }

  if (text.length < ABOUT_MIN) {
    score -= 40;
    findings.push({
      severity: 'critical',
      message: `About is only ${text.length} characters — too thin to build credibility.`,
      fix: `Expand to at least a short paragraph (aim for 400-1200 characters).`,
    });
  }
  if (text.length > ABOUT_MAX) {
    score -= 15;
    findings.push({
      severity: 'warn',
      message: `About is ${text.length} characters — readers skim, so this may get cut off.`,
      fix: 'Tighten to your strongest 1-2 paragraphs; move detail into Experience.',
    });
  }
  if (!/\b(i|i'm|i've|my|me)\b/i.test(text)) {
    score -= 20;
    findings.push({
      severity: 'warn',
      message: 'About is not written in the first person — it reads distant.',
      fix: 'Write as "I" — LinkedIn Abouts are personal, not third-person bios.',
    });
  }
  // "Hook": a strong opening line rather than a generic label.
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim() || '';
  if (firstSentence.length < 15) {
    score -= 15;
    findings.push({
      severity: 'warn',
      message: 'The opening line is weak — the first sentence is what shows before "see more".',
      fix: 'Open with a hook: a signature result, mission, or the problem you love solving.',
    });
  }
  if (!findings.length) {
    findings.push({ severity: 'good', message: 'About is present, first-person, and well-sized.', fix: '' });
  }
  return { name: 'About', score: clamp(score), findings };
}

function scoreExperience(experience: string): LinkedInSectionScore {
  const findings: LinkedInFinding[] = [];
  let score = 100;
  const bullets = extractExperienceBullets(experience);

  if (!bullets.length) {
    return {
      name: 'Experience',
      score: 0,
      findings: [{
        severity: 'critical',
        message: 'No experience bullets detected.',
        fix: 'Add 2-4 bullets per role describing what you did and the outcome.',
      }],
    };
  }

  // Reuse the resume action-verb rule so "starts with a strong action verb"
  // is defined identically to the editor's ATS check.
  const verbRule = analyzeActionVerbRule(bullets);
  if (!verbRule.passes) {
    score -= 35;
    findings.push({
      severity: 'warn',
      message: `Only ${verbRule.percentage}% of experience bullets start with a strong action verb.`,
      fix: 'Start each bullet with a verb like Led, Built, Shipped, Reduced — drop "Responsible for" / "Worked on".',
    });
  }

  const quantified = bullets.filter((b) => /\d/.test(b)).length;
  const quantRatio = quantified / bullets.length;
  if (quantRatio < 0.3) {
    score -= 30;
    findings.push({
      severity: 'warn',
      message: `Only ${Math.round(quantRatio * 100)}% of bullets include a number — impact is hard to gauge.`,
      fix: 'Quantify where it is TRUE: users, %, revenue, latency, team size. Never invent figures.',
    });
  }
  if (!findings.length) {
    findings.push({ severity: 'good', message: 'Experience bullets use strong verbs and quantify impact.', fix: '' });
  }
  return { name: 'Experience', score: clamp(score), findings };
}

function scoreSkills(skills: string[]): LinkedInSectionScore {
  const findings: LinkedInFinding[] = [];
  const count = skills.length;

  if (count === 0) {
    return {
      name: 'Skills',
      score: 0,
      findings: [{
        severity: 'critical',
        message: 'No skills detected.',
        fix: 'Add at least 5 relevant skills — LinkedIn lets you list up to 50 and they power search.',
      }],
    };
  }
  if (count < MIN_SKILLS) {
    return {
      name: 'Skills',
      score: 40,
      findings: [{
        severity: 'warn',
        message: `Only ${count} skill${count === 1 ? '' : 's'} listed — under the recommended minimum of ${MIN_SKILLS}.`,
        fix: `Add more relevant skills (aim for 10+) so you appear in more recruiter searches.`,
      }],
    };
  }
  return {
    name: 'Skills',
    score: count >= 10 ? 100 : 80,
    findings: [{
      severity: 'good',
      message: `${count} skills listed — good coverage for search.`,
      fix: '',
    }],
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function parseSuggestions(raw: string): {
  suggestedHeadline?: string;
  suggestedAbout?: string;
  suggestedSkills?: string[];
} | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;
  try {
    const obj = JSON.parse(candidate);
    if (!obj || typeof obj !== 'object') return null;
    const headline = typeof obj.suggestedHeadline === 'string' ? obj.suggestedHeadline.trim().slice(0, HEADLINE_MAX) : undefined;
    const about = typeof obj.suggestedAbout === 'string' ? obj.suggestedAbout.trim().slice(0, ABOUT_MAX) : undefined;
    const skills = Array.isArray(obj.suggestedSkills)
      ? obj.suggestedSkills.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim()).slice(0, 5)
      : undefined;
    if (!headline && !about && !(skills && skills.length)) return null;
    return { suggestedHeadline: headline, suggestedAbout: about, suggestedSkills: skills };
  } catch {
    return null;
  }
}
