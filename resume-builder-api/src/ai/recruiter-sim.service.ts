import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import { buildByokProvider } from './providers/byok-factory';
import { computeRuleBasedMatch, clampPercent } from './jd-match.service';

/** Optional bring-your-own-key headers forwarded from the request. */
export type ByokOptions = { provider?: string | null; key?: string | null };

/**
 * Recruiter-AI Simulator — Student/Pro feature.
 *
 * Every competitor's "ATS simulator" only shows parsed text or keyword math.
 * But in 2026 employers increasingly route resumes through an LLM ranking
 * agent that reads the resume against the JD and writes a recommendation. This
 * feature simulates THAT agent: it role-plays a hiring screener, reads the
 * candidate against the JD, and returns a verdict + reasoning the way a real
 * AI screen would hand to a recruiter.
 *
 * Honesty properties (consistent with the rest of the product):
 *   • A rule-based core always runs first, so the user gets a verdict even
 *     when the LLM is down. The LLM only enriches the reasoning.
 *   • The verdict is derived from a transparent score threshold, not a
 *     black box — the UI can explain exactly why.
 *   • We never invent employer-side facts; the prompt forbids fabrication.
 */

export type RecruiterSimInput = {
  resumeText: string;
  jdText: string;
  currentSkills?: string[];
};

export type RecruiterVerdict = 'advance' | 'maybe' | 'reject';

export type RecruiterSimResult = {
  verdict: RecruiterVerdict;
  /** 0-100 fit score the simulated agent assigns. */
  score: number;
  /** One-line recommendation the agent would surface to the recruiter. */
  recruiterNote: string;
  /** Why the candidate is compelling. */
  strengths: string[];
  /** What gives the agent pause. */
  concerns: string[];
  /** JD must-haves the agent could not find evidence for. */
  missingMustHaves: string[];
  provider: 'groq' | 'rule-based';
};

const MAX_INPUT_CHARS = 8000;

@Injectable()
export class RecruiterSimService {
  private readonly logger = new Logger(RecruiterSimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async simulate(userId: string, input: RecruiterSimInput, byok?: ByokOptions): Promise<RecruiterSimResult> {
    const resumeText = String(input?.resumeText || '').slice(0, MAX_INPUT_CHARS);
    const jdText = String(input?.jdText || '').slice(0, MAX_INPUT_CHARS);
    if (!resumeText.trim() || !jdText.trim()) {
      throw new ForbiddenException('Both resume and JD text are required.');
    }

    rateLimitOrThrow({
      key: `ai:recruiter-sim:${userId}`,
      limit: 15,
      windowMs: 60_000,
      message: 'Rate limit exceeded for Recruiter-AI Simulator. Try again shortly.',
    });

    // Rule-based baseline — guarantees a usable verdict even with no LLM.
    const baseline = buildRuleBasedVerdict(resumeText, jdText, input.currentSkills ?? []);

    // Post-pivot model: AI uses the user's OWN key (BYOK). No key → the
    // rule-based baseline is the answer (no subscription gate, no app-key spend).
    const provider = buildByokProvider(byok?.provider, byok?.key);
    if (!provider) return baseline;

    const system = [
      'You are an AI hiring screener inside an applicant-tracking system.',
      'A recruiter has asked you to evaluate ONE candidate against ONE job description',
      'and return a screening recommendation, exactly as you would in production.',
      'Return JSON with this exact shape and nothing else:',
      '{ "verdict": "advance" | "maybe" | "reject", "score": number 0-100,',
      '  "recruiterNote": string, "strengths": string[], "concerns": string[],',
      '  "missingMustHaves": string[] }',
      'Rules:',
      '  • verdict "advance" = you would forward to the hiring manager; "maybe" = borderline,',
      '    needs a human look; "reject" = does not clear the bar for this req.',
      '  • score reflects fit on must-have skills, seniority, and demonstrated impact.',
      '  • recruiterNote is one sentence under 30 words, plain and decisive.',
      '  • strengths/concerns: 2-4 short phrases each, grounded ONLY in the resume text.',
      '  • missingMustHaves: JD requirements you found no evidence for. Empty array if none.',
      '  • Never invent employer facts, salary, or candidate claims not in the resume.',
    ].join('\n');

    const userPrompt = [
      `RESUME:\n${resumeText}`,
      `\nJOB DESCRIPTION:\n${jdText}`,
      input.currentSkills?.length ? `\nDECLARED SKILLS: ${input.currentSkills.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '25000'), 10);
      const raw = await provider.complete(system, userPrompt, {
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs,
      });
      const parsed = parseRecruiterSimResponse(raw);
      if (!parsed) return baseline;
      return {
        verdict: parsed.verdict ?? baseline.verdict,
        score: clampPercent(parsed.score ?? baseline.score),
        recruiterNote: parsed.recruiterNote?.trim() || baseline.recruiterNote,
        strengths: parsed.strengths?.length ? parsed.strengths.slice(0, 4) : baseline.strengths,
        concerns: parsed.concerns?.length ? parsed.concerns.slice(0, 4) : baseline.concerns,
        missingMustHaves: parsed.missingMustHaves?.length
          ? parsed.missingMustHaves.slice(0, 6)
          : baseline.missingMustHaves,
        provider: 'groq',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Recruiter sim failed (provider=${provider.name}): ${msg}`);
      return baseline;
    }
  }

}

// ── Helpers (exported for tests) ────────────────────────────────────

/** Map a 0-100 fit score to a verdict using transparent thresholds. */
export function verdictForScore(score: number): RecruiterVerdict {
  if (score >= 70) return 'advance';
  if (score >= 45) return 'maybe';
  return 'reject';
}

/**
 * Deterministic verdict from keyword coverage. Reuses the JD-match rule core
 * so the simulator's offline answer stays consistent with the JD Match feature.
 */
export function buildRuleBasedVerdict(
  resumeText: string,
  jdText: string,
  currentSkills: string[],
): RecruiterSimResult {
  const match = computeRuleBasedMatch(resumeText, jdText, currentSkills);
  const score = clampPercent(match.matchPercent);
  const verdict = verdictForScore(score);
  const missing = match.missingKeywords.slice(0, 6);
  const strengths = match.matchedKeywords.slice(0, 4).map((k) => `Demonstrated ${k}`);
  const concerns = missing.length
    ? [`No clear evidence of ${missing.slice(0, 3).join(', ')}`]
    : ['Limited quantified impact to assess seniority'];
  const note =
    verdict === 'advance'
      ? `Strong keyword fit (${score}%); forwarding for a human review.`
      : verdict === 'maybe'
        ? `Partial fit (${score}%); borderline — needs a recruiter's eye.`
        : `Below the bar for this req on must-have coverage (${score}%).`;
  return {
    verdict,
    score,
    recruiterNote: note,
    strengths: strengths.length ? strengths : ['Resume parsed cleanly'],
    concerns,
    missingMustHaves: missing,
    provider: 'rule-based',
  };
}

export function parseRecruiterSimResponse(raw: string): Partial<RecruiterSimResult> | null {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim();
  // Tolerate code fences or stray prose around the JSON object.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  text = text.slice(first, last + 1);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  const verdict = obj.verdict;
  const validVerdict: RecruiterVerdict | undefined =
    verdict === 'advance' || verdict === 'maybe' || verdict === 'reject' ? verdict : undefined;
  const asStrings = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : undefined;
  return {
    verdict: validVerdict,
    score: typeof obj.score === 'number' ? obj.score : Number(obj.score),
    recruiterNote: typeof obj.recruiterNote === 'string' ? obj.recruiterNote : undefined,
    strengths: asStrings(obj.strengths),
    concerns: asStrings(obj.concerns),
    missingMustHaves: asStrings(obj.missingMustHaves),
  };
}
