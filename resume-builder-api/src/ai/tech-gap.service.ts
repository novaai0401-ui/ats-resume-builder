import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { XaiProvider } from './providers/xai.provider';
import { enforceResumeAiFreeDaily, recordResumeAiFreeUsage, resolveResumeAiProvider } from './resume-ai-access';
import { filterJdKeywords } from '../lib/keyword-stopwords';

export interface TechGapInput {
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
  }>;
  certifications?: Array<{ name: string }>;
  targetRole?: string;
  jdText?: string;
  /** Resume being analyzed — flags our-AI assist for the per-download fee. */
  resumeId?: string;
  /** Free, key-less, non-subscriber users must opt in to OUR AI (adds the ₹20 download fee). */
  aiOptIn?: boolean;
}

export interface TechGapResult {
  strongSkills: string[];
  missingCriticalSkills: string[];
  missingSecondarySkills: string[];
  leadershipGap: string[];
  architectureGap: string[];
  toolsGap: string[];
  addOnlyIfTrue: string[];
  resumeImprovementSuggestions: string[];
  learningRoadmap: Array<{ skill: string; priority: 'high' | 'medium' | 'low'; reason: string }>;
  estimatedRoleReadiness: {
    overall: string;
    technical: string;
    leadership: string;
    domain: string;
  };
  roleAlignmentSummary: string;
}

const SYSTEM_PROMPT = `You are an expert technology career advisor and ATS optimization specialist.

TASK: Analyze a resume against a target role/job description and identify technology gaps.

STRICT RULES:
1. NEVER fabricate skills the candidate has. Only report what's in the resume as "strong".
2. Skills NOT in the resume must be listed as "missing" — never claim they have them.
3. For missing items that MIGHT be inferable (e.g., they mention "led team" but not "team leadership"), put them in "addOnlyIfTrue".
4. Be specific about tools, frameworks, and methodologies — not vague categories.
5. Learning roadmap should be practical and prioritized.
6. Role readiness should be honest and realistic.

OUTPUT: Respond with valid JSON only matching this schema:
{
  "strongSkills": ["skills clearly present in resume"],
  "missingCriticalSkills": ["must-have skills for the target role that are absent"],
  "missingSecondarySkills": ["nice-to-have skills that would strengthen candidacy"],
  "leadershipGap": ["leadership/management signals expected but missing"],
  "architectureGap": ["architecture/design skills expected but missing"],
  "toolsGap": ["specific tools/platforms expected but missing"],
  "addOnlyIfTrue": ["items possibly inferable but not stated — add only if actually true"],
  "resumeImprovementSuggestions": ["specific, actionable resume changes"],
  "learningRoadmap": [{"skill": "...", "priority": "high|medium|low", "reason": "..."}],
  "estimatedRoleReadiness": {
    "overall": "percentage or qualitative",
    "technical": "assessment",
    "leadership": "assessment",
    "domain": "assessment"
  },
  "roleAlignmentSummary": "2-3 sentence summary of how well resume aligns with target role"
}`;

@Injectable()
export class TechGapService {
  private readonly logger = new Logger(TechGapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Tech Gap is ONE of the two AI features (with AI Critique) that a
   * free, key-less, non-subscriber user is allowed to run on the editor
   * page. For that user OUR AI runs and the resume is flagged so the next
   * download carries the AI fee. BYOK runs on the user's own key (free);
   * the ₹499 plan runs OUR AI with no per-download fee.
   */
  async analyze(
    userId: string,
    input: TechGapInput,
    byok?: { provider?: string | null; key?: string | null },
  ): Promise<TechGapResult> {
    // Resume-page AI access (R-086): OUR Groq key powers Tech Gap for every
    // user — BYOK (own key) / ₹499 plan (uncapped) / FREE (our key, capped to
    // N actions/user/day, shared across all resume AI buttons). No ₹20 fee.
    const { provider, source } = await resolveResumeAiProvider(
      this.prisma, userId, byok, () => this.resolveProvider(),
    );
    const freeDaily = source === 'free';

    if (!provider) {
      return this.buildRuleBasedAnalysis(input);
    }

    if (freeDaily) {
      await enforceResumeAiFreeDaily(this.prisma, this.config, userId, 'tech-gap');
    }

    const userPrompt = this.buildPrompt(input);

    try {
      const raw = await provider.complete(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 4096,
        temperature: 0.3,
        timeoutMs: 30_000,
      });
      const result = this.parseResponse(raw);
      if (freeDaily) {
        await recordResumeAiFreeUsage(this.prisma, userId, 'tech-gap');
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tech gap AI analysis failed: ${msg}`);
      return this.buildRuleBasedAnalysis(input);
    }
  }

  private buildPrompt(input: TechGapInput): string {
    const parts: string[] = [];

    if (input.summary) {
      parts.push(`PROFESSIONAL SUMMARY:\n${input.summary}`);
    }

    if (input.skills?.length) {
      parts.push(`SKILLS:\n${input.skills.join(', ')}`);
    }

    if (input.experience?.length) {
      const expText = input.experience.map((e) => {
        const bullets = e.highlights.filter(Boolean).map((h) => `  - ${h}`).join('\n');
        return `${e.role} at ${e.company} (${e.startDate} - ${e.endDate})\n${bullets}`;
      }).join('\n\n');
      parts.push(`WORK EXPERIENCE:\n${expText}`);
    }

    if (input.certifications?.length) {
      parts.push(`CERTIFICATIONS:\n${input.certifications.map((c) => c.name).join(', ')}`);
    }

    if (input.targetRole) {
      parts.push(`TARGET ROLE:\n${input.targetRole}`);
    }

    if (input.jdText) {
      parts.push(`JOB DESCRIPTION:\n${input.jdText.slice(0, 2000)}`);
    }

    return parts.join('\n\n') + '\n\nAnalyze the gaps and respond with JSON only.';
  }

  private parseResponse(raw: string): TechGapResult {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No valid JSON in AI response');
      parsed = JSON.parse(match[0]);
    }

    return {
      strongSkills: asStringArray(parsed.strongSkills),
      missingCriticalSkills: asStringArray(parsed.missingCriticalSkills),
      missingSecondarySkills: asStringArray(parsed.missingSecondarySkills),
      leadershipGap: asStringArray(parsed.leadershipGap),
      architectureGap: asStringArray(parsed.architectureGap),
      toolsGap: asStringArray(parsed.toolsGap),
      addOnlyIfTrue: asStringArray(parsed.addOnlyIfTrue),
      resumeImprovementSuggestions: asStringArray(parsed.resumeImprovementSuggestions),
      learningRoadmap: Array.isArray(parsed.learningRoadmap)
        ? parsed.learningRoadmap.slice(0, 10).map((item: Record<string, unknown>) => ({
            skill: String(item?.skill || ''),
            priority: ['high', 'medium', 'low'].includes(String(item?.priority)) ? String(item.priority) as 'high' | 'medium' | 'low' : 'medium',
            reason: String(item?.reason || ''),
          })).filter((i: { skill: string }) => i.skill)
        : [],
      estimatedRoleReadiness: {
        overall: String((parsed.estimatedRoleReadiness as Record<string, unknown>)?.overall || 'Not assessed'),
        technical: String((parsed.estimatedRoleReadiness as Record<string, unknown>)?.technical || 'Not assessed'),
        leadership: String((parsed.estimatedRoleReadiness as Record<string, unknown>)?.leadership || 'Not assessed'),
        domain: String((parsed.estimatedRoleReadiness as Record<string, unknown>)?.domain || 'Not assessed'),
      },
      roleAlignmentSummary: String(parsed.roleAlignmentSummary || ''),
    };
  }

  /** Rule-based fallback when AI provider is unavailable. */
  private buildRuleBasedAnalysis(input: TechGapInput): TechGapResult {
    const skills = new Set((input.skills || []).map((s) => s.toLowerCase()));
    const resumeText = [
      input.summary || '',
      ...(input.experience || []).flatMap((e) => [e.role, ...e.highlights]),
    ].join(' ').toLowerCase();

    // Filter generic English filler / section labels — the founder's
    // smoke test showed this surface listing "+ you + were + past +
    // worked + following + real" as "Missing Critical Skills" because
    // the local tokenize() had ZERO stopwords. Now shares the same
    // filter every other "missing keywords" surface uses.
    const jdTokens = tokenize(input.jdText || '');
    const missingFromJd = filterJdKeywords(
      jdTokens.filter((t) => !skills.has(t) && !resumeText.includes(t)),
    );

    const hasLeadership = /\b(led|managed|mentored|owned|coordinated)\b/.test(resumeText);
    const hasArchitecture = /\b(architect|design|system design|scalab|micro)\b/.test(resumeText);

    return {
      strongSkills: input.skills?.slice(0, 10) || [],
      missingCriticalSkills: missingFromJd.slice(0, 6),
      missingSecondarySkills: missingFromJd.slice(6, 10),
      leadershipGap: hasLeadership ? [] : ['Team leadership', 'Stakeholder management', 'Delivery ownership'],
      architectureGap: hasArchitecture ? [] : ['System design', 'Architecture decisions'],
      toolsGap: [],
      addOnlyIfTrue: ['People management', 'Budget planning', 'Roadmap ownership'],
      resumeImprovementSuggestions: [
        'Quantify achievements with metrics where possible.',
        'Align bullet language with target role terminology.',
      ],
      learningRoadmap: missingFromJd.slice(0, 5).map((s) => ({
        skill: s,
        priority: 'medium' as const,
        reason: 'Mentioned in job description but not in resume.',
      })),
      estimatedRoleReadiness: {
        overall: 'Partial match — upgrade for deeper AI analysis',
        technical: `${input.skills?.length || 0} skills listed`,
        leadership: hasLeadership ? 'Some leadership signals present' : 'Leadership signals weak',
        domain: 'Deeper domain assessment available with AI analysis.',
      },
      roleAlignmentSummary: 'Showing a basic gap analysis. AI-powered analysis is unavailable right now — try again shortly.',
    };
  }

  private resolveProvider(): AiProvider | null {
    // BYOK was removed — every paid user routes through the single
    // shared key configured by the operator. See subscription-mechanics.md.
    const name = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (name === 'xai') {
      const key = this.config.get<string>('XAI_API_KEY', '');
      return key ? new XaiProvider(key, this.config.get<string>('XAI_MODEL', '') || undefined) : null;
    }
    const key = this.config.get<string>('GROQ_API_KEY', '');
    return key ? new GroqProvider(key, this.config.get<string>('GROQ_MODEL', '') || undefined) : null;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => String(v).trim());
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s+#.]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}
