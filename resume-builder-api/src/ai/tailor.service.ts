import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUsagePeriod } from '../billing/usage';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { SettingsService } from '../settings/settings.service';
import type { AiProvider } from './providers/ai-provider.interface';
import { GroqProvider } from './providers/groq.provider';
import { buildByokProvider } from './providers/byok-factory';
import { isPlanActive } from './server-provider';
import { enforceResumeAiFreeDaily, recordResumeAiFreeUsage } from './resume-ai-access';

/**
 * R-034 — One-click tailor: JD → tailored ResumeVersion.
 *
 * Two-step flow, deliberately split so the user stays in control:
 *
 *   1. propose(): the LLM reads the resume + JD and returns a
 *      TailorProposal — per-bullet rewrites, a summary rewrite, and
 *      skills to add. NOTHING is saved. The client renders this as a
 *      diff with accept/reject per change.
 *
 *   2. apply(): the client sends back the accepted change set. We
 *      build the tailored resume object and store it as a NEW
 *      ResumeVersion labelled "Tailored: <role> @ <company>". The
 *      LIVE resume is untouched by default (applyToLive flips that),
 *      because tailoring is per-application — the master resume
 *      should stay the master.
 *
 * Why a version and not a copy-resume: ResumeVersion is what the
 * Outcome Loop attributes to (C-007). A tailored version used for an
 * application shows up in the per-version response-rate stats, which
 * is the entire point — "did tailoring to this JD actually get more
 * replies?" becomes answerable.
 *
 * Gating mirrors BulletRewriterService: STUDENT+ when payments are
 * enabled, AI-token quota charged per call, per-user rate limit.
 * Unlike the bullet rewriter there is NO rule-based fallback for the
 * proposal — a mechanical verb swap across a whole resume produces
 * garbage diffs that erode trust. If no provider is configured we
 * say so honestly.
 */

export type TailorBulletChange = {
  /** Index into resume.experience[] */
  experienceIndex: number;
  /** Index into experience[i].highlights[] */
  bulletIndex: number;
  before: string;
  after: string;
};

export type TailorProposal = {
  summary: { before: string; after: string } | null;
  bullets: TailorBulletChange[];
  skillsToAdd: string[];
  provider: 'groq';
  tokensUsed: number;
};

export type ApplyTailorInput = {
  jdCompany?: string;
  jdRole?: string;
  /** Accepted summary rewrite, or null/undefined to keep the original. */
  summary?: string | null;
  /** Accepted bullet changes (subset of the proposal). */
  bullets?: TailorBulletChange[];
  /** Accepted new skills (subset of skillsToAdd). */
  skillsToAdd?: string[];
  /** When true, also update the live resume. Default false. */
  applyToLive?: boolean;
};

const APPROX_TOKENS = 2500; // whole-resume read + structured rewrite
const MAX_JD_CHARS = 6000;
const MAX_BULLETS_IN_PROMPT = 40;

@Injectable()
export class TailorService {
  private readonly logger = new Logger(TailorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  // ───────────────────────── propose ─────────────────────────

  async propose(userId: string, resumeId: string, jdText: string, byok?: { provider?: string | null; key?: string | null }): Promise<TailorProposal> {
    const jd = String(jdText || '').trim().slice(0, MAX_JD_CHARS);
    if (jd.length < 80) {
      throw new BadRequestException('Paste the full job description (at least a few sentences) so tailoring has something to work with.');
    }

    rateLimitOrThrow({
      key: `ai:tailor:${userId}`,
      limit: 6,
      windowMs: 60_000,
      message: 'Rate limit exceeded for tailoring. Try again in a minute.',
    });

    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new NotFoundException('Resume not found.');

    // Resume-page AI access (R-086): OUR Groq key powers Tailor for every
    // user — BYOK (own key) / ₹499 plan (uncapped) / FREE (our key, capped to
    // N actions/user/day, shared across all resume AI buttons). There is no
    // rule-based tailoring, so if no server key is configured at all we still
    // ask the user to add a key or subscribe.
    const byokProvider = buildByokProvider(byok?.provider, byok?.key);
    let provider = byokProvider;
    let freeDaily = false;
    if (!provider) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (isPlanActive(user?.plan)) {
        provider = this.resolveProvider();
      } else {
        provider = this.resolveProvider();
        freeDaily = Boolean(provider);
      }
    }
    if (!provider) {
      throw new ForbiddenException(
        'AI tailoring needs AI access. Add your own AI key in Settings (free), or get the ₹499/mo plan.',
      );
    }
    if (freeDaily) {
      await enforceResumeAiFreeDaily(this.prisma, this.config, userId);
    }

    const experience = Array.isArray(resume.experience) ? (resume.experience as any[]) : [];
    const bulletsCatalog: Array<{ experienceIndex: number; bulletIndex: number; text: string; role: string; company: string }> = [];
    experience.forEach((exp, ei) => {
      const highlights = Array.isArray(exp?.highlights) ? exp.highlights : [];
      highlights.forEach((h: unknown, bi: number) => {
        if (bulletsCatalog.length >= MAX_BULLETS_IN_PROMPT) return;
        const text = String(h || '').trim();
        if (text) bulletsCatalog.push({ experienceIndex: ei, bulletIndex: bi, text, role: String(exp?.role || ''), company: String(exp?.company || '') });
      });
    });

    const system = [
      'You are an expert ATS resume tailor.',
      'Given a resume (summary + numbered bullets + skills) and a target job description, propose tailored rewrites.',
      'Rules:',
      '  1. NEVER invent achievements, employers, numbers, or skills the candidate does not have.',
      '  2. Rewrite ONLY where tailoring helps match the JD: surface relevant keywords, reorder emphasis, tighten phrasing.',
      '  3. Leave bullets that are already well-matched alone — do not rewrite for the sake of it.',
      '  4. Each rewritten bullet starts with a strong action verb and stays under 28 words.',
      '  5. skillsToAdd may ONLY contain skills that are clearly evidenced by the resume content but missing from the skills list.',
      '  6. Plain ASCII. No markdown, no emoji.',
      'Respond ONLY with JSON matching exactly this shape:',
      '{"summary": "<rewritten summary or empty string to keep original>",',
      ' "bullets": [{"id": <number>, "after": "<rewritten bullet>"}],',
      ' "skillsToAdd": ["<skill>"]}',
      'The "id" is the bullet number from the input. Include ONLY bullets you changed.',
    ].join('\n');

    const userPrompt = [
      `TARGET JOB DESCRIPTION:\n"""${jd}"""`,
      '',
      `RESUME SUMMARY:\n"""${String(resume.summary || '').slice(0, 1200)}"""`,
      '',
      'RESUME BULLETS:',
      ...bulletsCatalog.map((b, i) => `${i}. [${b.role} @ ${b.company}] ${b.text}`),
      '',
      `CURRENT SKILLS: ${(Array.isArray(resume.skills) ? resume.skills : []).join(', ').slice(0, 800)}`,
    ].join('\n');

    let raw: string;
    try {
      const timeoutMs = parseInt(this.config.get<string>('AI_TIMEOUT_MS', '30000'), 10);
      raw = await provider.complete(system, userPrompt, {
        maxTokens: 1800,
        temperature: 0.3,
        timeoutMs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tailor proposal failed (provider=${provider.name}): ${msg}`);
      throw new ForbiddenException('AI tailoring failed. Your token quota was charged once — retry is free for the next minute.');
    }

    const parsed = parseTailorResponse(raw, bulletsCatalog);
    if (freeDaily) {
      await recordResumeAiFreeUsage(this.prisma, userId);
    }
    return {
      summary: parsed.summary && parsed.summary !== String(resume.summary || '').trim()
        ? { before: String(resume.summary || ''), after: parsed.summary }
        : null,
      bullets: parsed.bullets,
      skillsToAdd: parsed.skillsToAdd,
      provider: 'groq',
      tokensUsed: APPROX_TOKENS,
    };
  }

  // ───────────────────────── apply ─────────────────────────

  async apply(userId: string, resumeId: string, input: ApplyTailorInput) {
    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new NotFoundException('Resume not found.');

    const acceptedBullets = Array.isArray(input.bullets) ? input.bullets : [];
    const acceptedSkills = Array.isArray(input.skillsToAdd)
      ? input.skillsToAdd.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20)
      : [];
    const acceptedSummary = typeof input.summary === 'string' && input.summary.trim()
      ? input.summary.trim().slice(0, 2000)
      : null;

    if (!acceptedBullets.length && !acceptedSkills.length && !acceptedSummary) {
      throw new BadRequestException('Nothing to apply — accept at least one change.');
    }

    // Build the tailored experience array. Validate indices against
    // the CURRENT resume so a stale proposal (resume edited in the
    // meantime) cannot write a bullet into the wrong slot: the before
    // text must still match.
    const experience = Array.isArray(resume.experience)
      ? JSON.parse(JSON.stringify(resume.experience)) as any[]
      : [];
    const rejectedAsStale: TailorBulletChange[] = [];
    for (const change of acceptedBullets) {
      const exp = experience[change.experienceIndex];
      const highlights = Array.isArray(exp?.highlights) ? exp.highlights : null;
      const current = highlights ? String(highlights[change.bulletIndex] ?? '') : '';
      if (!highlights || current.trim() !== String(change.before || '').trim()) {
        rejectedAsStale.push(change);
        continue;
      }
      highlights[change.bulletIndex] = String(change.after || '').trim().slice(0, 500);
    }

    const skills = Array.isArray(resume.skills) ? [...(resume.skills as string[])] : [];
    for (const skill of acceptedSkills) {
      if (!skills.some((s) => String(s).toLowerCase() === skill.toLowerCase())) {
        skills.push(skill);
      }
    }

    const company = String(input.jdCompany || '').trim().slice(0, 60);
    const role = String(input.jdRole || '').trim().slice(0, 60);
    const label = ['Tailored', [role, company].filter(Boolean).join(' @ ')]
      .filter(Boolean)
      .join(': ')
      .slice(0, 120);

    const snapshotPayload = {
      title: resume.title,
      contact: resume.contact,
      summary: acceptedSummary ?? resume.summary,
      skills,
      languages: Array.isArray(resume.languages) ? resume.languages : [],
      experience,
      education: resume.education,
      projects: resume.projects,
      certifications: resume.certifications,
      templateId: resume.templateId || null,
    };

    const version = await this.prisma.resumeVersion.create({
      data: {
        resumeId,
        userId,
        label: label || 'Tailored version',
        snapshot: snapshotPayload as unknown as object,
      },
      select: { id: true, resumeId: true, label: true, createdAt: true },
    });

    if (input.applyToLive) {
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: {
          summary: snapshotPayload.summary,
          skills: snapshotPayload.skills,
          experience: snapshotPayload.experience as object,
        },
      });
    }

    return {
      version,
      appliedBullets: acceptedBullets.length - rejectedAsStale.length,
      rejectedAsStale: rejectedAsStale.length,
      appliedToLive: Boolean(input.applyToLive),
    };
  }

  // ── Plan + quota gating (mirrors BulletRewriterService) ──────────
  private async checkAndCharge(userId: string, tokens: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const paymentFeatureEnabled = await this.settingsService.isPaymentFeatureEnabled();
    if (paymentFeatureEnabled && user.plan === 'FREE') {
      throw new ForbiddenException('FREE_PLAN_AI_BLOCKED: AI tailoring requires Student or Pro.');
    }
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

/**
 * Parse the LLM's JSON response into validated changes. Bullets with
 * out-of-range ids, empty rewrites, or rewrites identical to the
 * original are dropped — only real, apply-able changes survive.
 */
export function parseTailorResponse(
  raw: string,
  catalog: Array<{ experienceIndex: number; bulletIndex: number; text: string }>,
): { summary: string; bullets: TailorBulletChange[]; skillsToAdd: string[] } {
  const empty = { summary: '', bullets: [] as TailorBulletChange[], skillsToAdd: [] as string[] };
  if (!raw) return empty;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return empty;
  }
  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim().slice(0, 2000) : '';
  const skillsToAdd = Array.isArray(parsed?.skillsToAdd)
    ? parsed.skillsToAdd.map((s: unknown) => String(s || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const bullets: TailorBulletChange[] = [];
  const rows = Array.isArray(parsed?.bullets) ? parsed.bullets : [];
  for (const row of rows) {
    const id = Number(row?.id);
    const after = String(row?.after || '').trim().slice(0, 500);
    if (!Number.isInteger(id) || id < 0 || id >= catalog.length) continue;
    if (!after) continue;
    const source = catalog[id];
    if (after === source.text.trim()) continue; // no-op rewrite
    bullets.push({
      experienceIndex: source.experienceIndex,
      bulletIndex: source.bulletIndex,
      before: source.text,
      after,
    });
  }
  return { summary, bullets, skillsToAdd };
}
