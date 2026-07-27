import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { buildByokProvider } from './providers/byok-factory';
import { isPlanActive } from './server-provider';
import { enforceFreeTrialOrThrow, recordFreeTrialUse, type AiFeatureKey } from './free-trial';

/**
 * Interview Prep Cards — Pro only.
 *
 * Generate 8 likely interview questions from a candidate's resume +
 * target role, each with:
 *   • category — 'behavioral' | 'technical' | 'role-specific'
 *   • question — what the interviewer asks
 *   • whyAsked — the signal the interviewer is looking for
 *   • answerOutline — 3 bullets a strong answer would hit, drawn
 *     from the candidate's actual experience (no invention).
 *
 * Strict Pro-only because:
 *   • Highest token cost of any feature (~1500 / call).
 *   • Highest perceived value — the user is preparing for actual
 *     interviews; we should make this sting to leave on the table.
 */

export type InterviewPrepInput = {
  resumeText: string;
  targetRole?: string;
  jdText?: string;
};

export type InterviewQuestion = {
  category: 'behavioral' | 'technical' | 'role-specific';
  question: string;
  whyAsked: string;
  answerOutline: string[];
};

export type InterviewPrepResult = {
  questions: InterviewQuestion[];
  provider: 'groq' | 'rule-based';
};

const APPROX_TOKENS = 1500;
const MAX_RESUME_CHARS = 6000;
const MAX_JD_CHARS = 3000;

@Injectable()
export class InterviewPrepService {
  private readonly logger = new Logger(InterviewPrepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async generate(userId: string, input: InterviewPrepInput, byok?: { provider?: string | null; key?: string | null }): Promise<InterviewPrepResult> {
    const resumeText = String(input?.resumeText || '').slice(0, MAX_RESUME_CHARS);
    const targetRole = String(input?.targetRole || '').trim().slice(0, 100);
    const jdText = String(input?.jdText || '').slice(0, MAX_JD_CHARS);
    if (!resumeText.trim()) {
      throw new ForbiddenException('Resume text is required.');
    }

    rateLimitOrThrow({
      key: `ai:interview-prep:${userId}`,
      limit: 5,
      windowMs: 5 * 60_000,
      message: 'Rate limit exceeded for interview prep. Try again in a few minutes.',
    });

    // Non-resume AI: BYOK is free; ₹499/mo plan unlocks OUR AI. With
    // neither, return the rule-based cards (free baseline + upsell), never
    // our app key.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    const planActive = isPlanActive(user.plan);
    // R-098 — a free, key-less, plan-less user gets ONE real AI interview-prep
    // run on our key; the second attempt throws the structured trial error.
    let trialFeature: AiFeatureKey | null = null;
    if (!byokProvider && !planActive) {
      if (!this.resolveProvider()) {
        return {
          questions: ruleBasedInterviewQuestions(targetRole, resumeText),
          provider: 'rule-based',
        };
      }
      await enforceFreeTrialOrThrow(this.prisma, userId, 'interview-prep');
      trialFeature = 'interview-prep';
    }
    // The plan path spends the subscriber token budget; the one free trial
    // run does not (it is metered by the trial ledger instead).
    if (!byokProvider && planActive) {
      await this.chargePlanTokens(userId, APPROX_TOKENS);
    }

    const provider = byokProvider || this.resolveProvider();
    if (!provider) {
      this.logger.warn('No AI provider configured — returning rule-based interview prep cards');
      return {
        questions: ruleBasedInterviewQuestions(targetRole, resumeText),
        provider: 'rule-based',
      };
    }

    const system = [
      'You are a senior hiring manager preparing a candidate for an interview.',
      'Generate exactly 8 likely interview questions for the role provided.',
      'Mix categories: ~3 behavioral, ~3 technical, ~2 role-specific.',
      'Return JSON ONLY with this shape:',
      '{ "questions": [ { "category": "behavioral|technical|role-specific", "question": "...", "whyAsked": "...", "answerOutline": ["...", "...", "..."] }, ...8 ] }',
      'Rules:',
      '  • Each `answerOutline` is exactly 3 bullets the candidate could say, drawn from their resume.',
      '  • Reference the candidate\'s actual companies / projects when possible.',
      '  • Do not invent achievements not in the resume.',
      '  • Keep each bullet under 25 words. Plain ASCII; no markdown, no emoji.',
    ].join('\n');

    const userPrompt = [
      `RESUME:\n${resumeText}`,
      targetRole ? `\nTARGET ROLE: ${targetRole}` : '',
      jdText ? `\nJOB DESCRIPTION:\n${jdText}` : '',
    ].filter(Boolean).join('\n');

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '40000'), 10);
      const raw = await provider.complete(system, userPrompt, {
        maxTokens: 1800,
        temperature: 0.5,
        timeoutMs,
      });
      const parsed = parseInterviewPrepResponse(raw);
      if (!parsed || parsed.length === 0) {
        return {
          questions: ruleBasedInterviewQuestions(targetRole, resumeText),
          provider: 'rule-based',
        };
      }
      if (trialFeature) await recordFreeTrialUse(this.prisma, userId, trialFeature);
      return { questions: parsed.slice(0, 8), provider: 'groq' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Interview prep failed (provider=${provider.name}): ${msg}`);
      return {
        questions: ruleBasedInterviewQuestions(targetRole, resumeText),
        provider: 'rule-based',
      };
    }
  }

  /** Charge app-AI tokens for plan users (BYOK users don't reach here). */
  private async chargePlanTokens(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    await ensureUsagePeriod(this.prisma, user);
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!updated) throw new ForbiddenException('User not found');
    if (updated.aiTokensUsed + tokens > updated.aiTokensLimit) {
      throw new ForbiddenException('AI usage limit exceeded for this period.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { aiTokensUsed: updated.aiTokensUsed + tokens },
    });
  }

  private resolveProvider(): AiProvider | null {
    const providerName = this.config.get<string>('AI_PROVIDER', 'groq').toLowerCase();
    if (providerName !== 'groq') return null;
    const key = this.config.get<string>('GROQ_API_KEY', '');
    if (!key) return null;
    const model = this.config.get<string>('GROQ_MODEL', '');
    return new GroqProvider(key, model || undefined);
  }
}

// ── Helpers (exported for tests) ────────────────────────────────────

const VALID_CATEGORIES: InterviewQuestion['category'][] = ['behavioral', 'technical', 'role-specific'];

export function parseInterviewPrepResponse(raw: string): InterviewQuestion[] | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;
  try {
    const obj = JSON.parse(candidate);
    if (!obj || !Array.isArray(obj.questions)) return null;
    const questions: InterviewQuestion[] = [];
    for (const q of obj.questions) {
      if (!q || typeof q !== 'object') continue;
      const cat = String(q.category || '').toLowerCase();
      const category = (VALID_CATEGORIES as string[]).includes(cat)
        ? (cat as InterviewQuestion['category'])
        : 'behavioral';
      const question = typeof q.question === 'string' ? q.question.trim() : '';
      const whyAsked = typeof q.whyAsked === 'string' ? q.whyAsked.trim() : '';
      const answerOutline = Array.isArray(q.answerOutline)
        ? q.answerOutline
            .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
            .map((s: string) => s.trim())
            .slice(0, 5)
        : [];
      if (!question || answerOutline.length === 0) continue;
      questions.push({ category, question, whyAsked, answerOutline });
    }
    return questions;
  } catch {
    return null;
  }
}

/**
 * Always-available fallback. We don't try to be clever about it —
 * the goal is "user gets *something* useful" when the LLM is down.
 * Eight role-agnostic questions that any IC interview tends to hit.
 */
export function ruleBasedInterviewQuestions(
  targetRole: string,
  resumeText: string,
): InterviewQuestion[] {
  const role = targetRole || 'this role';
  const recentLine = (resumeText.split('\n').find((l) => l.trim().length > 30) || '').trim().slice(0, 200);
  return [
    {
      category: 'behavioral',
      question: 'Walk me through your most recent project — what was your specific contribution?',
      whyAsked: 'Tests storytelling, ownership clarity, and ability to summarise complex work.',
      answerOutline: [
        'Set the scene in 1 sentence (team size, timeline, business goal).',
        'State your specific role and the 2–3 hardest decisions you owned.',
        recentLine || 'Close with the measurable outcome (numbers if possible).',
      ],
    },
    {
      category: 'behavioral',
      question: 'Tell me about a time you disagreed with a teammate. How did you handle it?',
      whyAsked: 'Tests conflict resolution + how you advocate without being abrasive.',
      answerOutline: [
        'Describe the disagreement neutrally (no villain framing).',
        'Show that you sought to understand their position before advocating yours.',
        'End with the resolution and what you learned.',
      ],
    },
    {
      category: 'behavioral',
      question: 'What\'s a project that didn\'t go well, and what did you take away?',
      whyAsked: 'Self-awareness signal — interviewers prefer "honest learner" to "perfect record".',
      answerOutline: [
        'Pick a real example with a clear failure mode.',
        'Take responsibility for your part without over-claiming blame.',
        'State the concrete change you\'ve made since.',
      ],
    },
    {
      category: 'technical',
      question: `Walk me through the architecture of one system you built that's relevant to ${role}.`,
      whyAsked: 'Tests depth of involvement vs surface knowledge.',
      answerOutline: [
        'Start with the user-facing problem, not the tech.',
        'Sketch the components and the data flow on the whiteboard.',
        'Highlight the trade-offs you weighed (cost vs latency vs simplicity).',
      ],
    },
    {
      category: 'technical',
      question: 'How would you debug a production issue where one endpoint is suddenly slow for 1% of users?',
      whyAsked: 'Tests systematic thinking under ambiguity.',
      answerOutline: [
        'First minute: check dashboards (latency p99, error rate, traffic).',
        'Narrow the affected slice (geography, client version, user cohort).',
        'Form hypothesis → reproduce → fix or roll back → write a postmortem.',
      ],
    },
    {
      category: 'technical',
      question: 'Pick one technology on your resume and tell me one thing you don\'t love about it.',
      whyAsked: 'Tests genuine experience — anyone who\'s used a tool has gripes.',
      answerOutline: [
        'Pick a tool you really use, not your strongest one.',
        'Be specific (a particular API, performance edge, or DX issue).',
        'Show how you work around it.',
      ],
    },
    {
      category: 'role-specific',
      question: `Why ${role}, and why now?`,
      whyAsked: 'Motivation check — interviewers screen out "any role will do" candidates.',
      answerOutline: [
        'Tie the role to a concrete trajectory ("the next step from X to Y").',
        'Mention something specific about the team / company / mission.',
        'Avoid generic "I love your product" filler.',
      ],
    },
    {
      category: 'role-specific',
      question: 'Where do you want to be in 3 years, and how does this role get you there?',
      whyAsked: 'Tests ambition + retention signal.',
      answerOutline: [
        'State a concrete capability you want to grow (e.g. "lead a team of 5").',
        'Show how this role\'s scope helps you grow that capability.',
        'Avoid title-only answers ("I want to be a Director") — talk about impact.',
      ],
    },
  ];
}
