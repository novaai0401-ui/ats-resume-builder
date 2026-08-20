import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { templatesForIndustry } from 'resume-builder-shared';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimitOrThrow } from '../limits/rate-limit';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { XaiProvider } from './providers/xai.provider';
import { enforceResumeAiFreeDaily, recordResumeAiFreeUsage, resolveResumeAiProvider } from './resume-ai-access';
import { approxTokens, enforcePlanMonthlyTokens, modelForFeature, recordAiUsage } from './ai-usage';

/**
 * Profile Copilot — the automated driver behind "what should I do next?".
 *
 * Reads the user's OWN saved resume (no pasting, no prompt-writing) and returns
 * a prioritised action plan: what is weakest, why it costs callbacks, and where
 * in the app to fix it. Runs on the same subscription contract as every other
 * AI feature (resolveResumeAiProvider): BYOK uncapped, paid plan uncapped, FREE
 * capped per day.
 *
 * The design rule inherited from the LinkedIn optimizer: the RULE-BASED plan
 * always runs first, so the feature never dead-ends — a FREE user past their
 * daily cap still gets a real, specific plan; AI adds a personalised assessment
 * and re-ranking on top rather than being a prerequisite.
 */

export type CopilotAction = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  /** Editor section the action belongs to — the UI deep-links with it. */
  section: string;
  title: string;
  detail: string;
  /** App route that takes the user to where they can act. */
  cta: string;
};

export type CopilotPlan = {
  resumeId: string;
  resumeTitle: string;
  /** One-line overall read on the resume. AI-written when available. */
  assessment: string;
  actions: CopilotAction[];
  /** True when an AI pass ran on top of the rule-based plan. */
  aiEnhanced: boolean;
  /** Which access path served the AI: 'byok' | 'plan' | 'free' | 'none'. */
  aiSource: string;
};

const MAX_ACTIONS = 6;

const SYSTEM_PROMPT = `You are a resume coach inside CallbackCV. You are given a
candidate's resume data and a draft action list produced by rules. Return STRICT
JSON: {"assessment": string, "actions": [{"id": string, "severity": "high"|"medium"|"low",
"section": string, "title": string, "detail": string}]}.
Rules: ground every claim in the given resume — invent nothing; keep at most ${MAX_ACTIONS}
actions, most impactful first; keep the rule actions you agree with (same id), drop ones you
don't, and you may add up to 2 new ones with id "ai-1"/"ai-2" and section one of
summary|experience|skills|education|projects|template. detail is 1–2 sentences,
specific to THIS resume, no generic advice. assessment is one sentence, direct,
no flattery.`;

@Injectable()
export class ProfileCopilotService {
  private readonly logger = new Logger(ProfileCopilotService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async plan(
    userId: string,
    resumeId: string,
    byok?: { provider?: string | null; key?: string | null; model?: string | null },
  ): Promise<CopilotPlan> {
    if (!String(resumeId || '').trim()) {
      throw new ForbiddenException('resumeId is required.');
    }
    rateLimitOrThrow({
      key: `ai:copilot:${userId}`,
      limit: 20,
      windowMs: 60_000,
      message: 'Rate limit exceeded for the copilot. Try again shortly.',
    });

    // Scoped by userId — one user cannot request a plan for another's resume.
    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new NotFoundException('Resume not found');

    const baseline = buildRuleBasedPlan(resume as unknown as ResumeShape);

    const { provider, source } = await resolveResumeAiProvider(
      this.prisma, userId, byok, () => this.resolveProvider(),
    );
    const freeDaily = source === 'free';

    const base: CopilotPlan = {
      resumeId,
      resumeTitle: String(resume.title || 'Resume'),
      assessment: baseline.assessment,
      actions: baseline.actions,
      aiEnhanced: false,
      aiSource: provider ? String(source ?? 'none') : 'none',
    };
    if (!provider) return base;

    if (freeDaily) {
      await enforceResumeAiFreeDaily(this.prisma, this.config, userId, 'profile-copilot');
    }
    // Paid plans are uncapped per-call but carry a monthly token ceiling —
    // one scripted abuser must not turn the best-margin customer negative.
    if (source === 'plan') {
      await enforcePlanMonthlyTokens(this.prisma, userId);
    }

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
      const userPrompt = buildUserPrompt(resume as unknown as ResumeShape, baseline.actions);
      const raw = await provider.complete(SYSTEM_PROMPT, userPrompt, {
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs,
      });
      // Meter every billable call — the ceiling and the daily spend report are
      // only as good as this recording. BYOK is deliberately not recorded: it
      // costs us nothing and is the user's own spend.
      if (source !== 'byok') {
        await recordAiUsage(this.prisma, {
          userId,
          feature: 'profile-copilot',
          tokensUsed: approxTokens(SYSTEM_PROMPT, userPrompt, raw),
          model: modelForFeature(this.config, 'profile-copilot'),
        });
      }
      const enriched = parseAiPlan(raw, baseline.actions);
      if (!enriched) return base;
      if (freeDaily) {
        await recordResumeAiFreeUsage(this.prisma, userId, 'profile-copilot');
      }
      return { ...base, assessment: enriched.assessment, actions: enriched.actions, aiEnhanced: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Copilot AI failed (provider=${provider.name}): ${msg}`);
      return base;
    }
  }

  private resolveProvider(): AiProvider | null {
    const name = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (name === 'xai') {
      const key = this.config.get<string>('XAI_API_KEY', '');
      return key ? new XaiProvider(key, this.config.get<string>('XAI_MODEL', '') || undefined) : null;
    }
    const key = this.config.get<string>('GROQ_API_KEY', '');
    // Light model: the copilot returns a short JSON plan, where the 8B model is
    // indistinguishable from 70B and ~10x cheaper.
    return key ? new GroqProvider(key, modelForFeature(this.config, 'profile-copilot')) : null;
  }
}

// ── Rule-based plan (exported for tests) ───────────────────────────────────

type ResumeShape = {
  title?: string | null;
  summary?: string | null;
  skills?: unknown;
  technicalSkills?: unknown;
  experience?: unknown;
  education?: unknown;
  projects?: unknown;
  achievements?: unknown;
  certifications?: unknown;
  contact?: { location?: string; links?: unknown } | null;
  templateId?: string | null;
  industry?: string | null;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strList = (v: unknown): string[] => list(v).map((x) => String(x ?? '').trim()).filter(Boolean);

/**
 * The plan a user gets even with zero AI access. Every rule states a concrete,
 * checkable fact about THIS resume — never generic advice — because the copilot
 * is only trustworthy if the user can verify each claim by looking.
 */
export function buildRuleBasedPlan(resume: ResumeShape): { assessment: string; actions: CopilotAction[] } {
  const actions: CopilotAction[] = [];
  const summary = String(resume.summary || '').trim();
  const experience = list(resume.experience) as Array<{ role?: string; highlights?: unknown }>;
  const skills = strList(resume.skills).concat(strList(resume.technicalSkills));
  const achievements = strList(resume.achievements);
  const education = list(resume.education);

  if (!summary) {
    actions.push({
      id: 'summary-missing', severity: 'high', section: 'summary',
      title: 'Write a summary',
      detail: 'Recruiters and ATS parsers read this section first, and yours is empty. Two lines: who you are, and your strongest measurable result.',
      cta: '/resume?section=summary',
    });
  } else if (!/\d/.test(summary)) {
    actions.push({
      id: 'summary-no-numbers', severity: 'medium', section: 'summary',
      title: 'Put a number in your summary',
      detail: 'Your summary has no quantified result. One figure (team size, %, revenue) makes it read as evidence instead of adjectives.',
      cta: '/resume?section=summary',
    });
  }

  const bullets = experience.flatMap((e) => strList(e?.highlights));
  const numberless = bullets.filter((b) => !/\d/.test(b));
  if (bullets.length && numberless.length / bullets.length > 0.6) {
    actions.push({
      id: 'bullets-no-metrics', severity: 'high', section: 'experience',
      title: `Quantify your experience bullets (${numberless.length} of ${bullets.length} have no number)`,
      detail: 'Bullets without a measurable outcome read as duties, not achievements. Use the AI rewrite on each bullet, or add scale: how many, how much, how fast.',
      cta: '/resume?section=experience',
    });
  }
  if (!experience.length) {
    actions.push({
      id: 'experience-missing', severity: 'high', section: 'experience',
      title: 'Add your work experience',
      detail: 'There are no roles on this resume yet. Even one role with three outcome bullets changes what every screen sees.',
      cta: '/resume?section=experience',
    });
  }

  if (skills.length < 6) {
    actions.push({
      id: 'skills-thin', severity: skills.length ? 'medium' : 'high', section: 'skills',
      title: skills.length ? `Add more skills (only ${skills.length} listed)` : 'Add your skills',
      detail: 'ATS keyword matching and the job-match feed both key on this list. Aim for 8–12 skills the postings you want actually name.',
      cta: '/resume?section=skills',
    });
  }

  if (!achievements.length) {
    actions.push({
      id: 'achievements-missing', severity: 'low', section: 'achievements',
      title: 'Add one achievement',
      detail: 'Awards and standout wins are the fastest trust signal on a resume, and this section is empty. One line is enough.',
      cta: '/resume?section=achievements',
    });
  }

  if (!education.length) {
    actions.push({
      id: 'education-missing', severity: 'medium', section: 'education',
      title: 'Add your education',
      detail: 'Many ATS filters hard-require an education entry; without one, some screens reject before a person ever looks.',
      cta: '/resume?section=education',
    });
  }

  const recommended = templatesForIndustry(resume.industry || null);
  if (recommended?.length && resume.templateId && !recommended.includes(resume.templateId as never)) {
    actions.push({
      id: 'template-mismatch', severity: 'low', section: 'template',
      title: 'Consider a template tuned to your industry',
      detail: `For your field, ${recommended[0]} is the stronger starting point than your current template — switching re-flows your content without retyping.`,
      cta: '/resume/template',
    });
  }

  const ranked = actions
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_ACTIONS);

  const high = ranked.filter((a) => a.severity === 'high').length;
  const assessment = !ranked.length
    ? 'Solid foundation — every core section is filled in. The next wins are polish: sharper numbers and tighter bullets.'
    : high
      ? `${high} high-impact gap${high === 1 ? '' : 's'} to close before this resume works as hard as it could.`
      : 'The fundamentals are in place — the actions below are refinements, not rescues.';

  return { assessment, actions: ranked };
}

function severityRank(s: CopilotAction['severity']): number {
  return s === 'high' ? 0 : s === 'medium' ? 1 : 2;
}

function buildUserPrompt(resume: ResumeShape, draft: CopilotAction[]): string {
  const experience = (list(resume.experience) as Array<Record<string, unknown>>)
    .slice(0, 5)
    .map((e) => `- ${String(e.role || '')} @ ${String(e.company || '')}: ${strList(e.highlights).slice(0, 4).join(' | ')}`)
    .join('\n');
  return [
    `TITLE: ${String(resume.title || '')}`,
    `SUMMARY: ${String(resume.summary || '(none)')}`,
    `SKILLS: ${strList(resume.skills).concat(strList(resume.technicalSkills)).slice(0, 20).join(', ') || '(none)'}`,
    `EXPERIENCE:\n${experience || '(none)'}`,
    `ACHIEVEMENTS: ${strList(resume.achievements).join(' | ') || '(none)'}`,
    `\nDRAFT ACTIONS (from rules):\n${JSON.stringify(draft.map(({ cta, ...rest }) => rest))}`,
    '\nReturn the JSON described in the system prompt.',
  ].join('\n');
}

/** Parse the AI response, keeping the rule actions' CTAs (the model has no
 *  routing knowledge, so ctas always come from our side). */
export function parseAiPlan(
  raw: string,
  draft: CopilotAction[],
): { assessment: string; actions: CopilotAction[] } | null {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: { assessment?: unknown; actions?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const assessment = String(parsed?.assessment || '').trim();
  const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : null;
  if (!assessment || !rawActions) return null;

  const byId = new Map(draft.map((a) => [a.id, a]));
  const ctaFor = (section: string) =>
    section === 'template' ? '/resume/template' : `/resume?section=${encodeURIComponent(section)}`;

  const actions: CopilotAction[] = [];
  for (const raw of rawActions.slice(0, MAX_ACTIONS)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = String(r.id || '').trim();
    const title = String(r.title || '').trim();
    const detail = String(r.detail || '').trim();
    const section = String(r.section || '').trim() || 'summary';
    const severity = (['high', 'medium', 'low'] as const).includes(r.severity as never)
      ? (r.severity as CopilotAction['severity'])
      : 'medium';
    if (!id || !title || !detail) continue;
    actions.push({
      id, severity, section, title, detail,
      cta: byId.get(id)?.cta || ctaFor(section),
    });
  }
  return actions.length ? { assessment, actions } : null;
}
