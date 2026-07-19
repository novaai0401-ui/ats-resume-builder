import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { ResumeService } from '../resume/resume.service';

/**
 * Anonymous "one free ATS check" for the /ats-resume-checker lander.
 *
 * NO auth guard on purpose: the lander promises "Check my resume — free"
 * and a login wall on that promise is a trust violation (C-003). This
 * endpoint therefore:
 *
 *   - reuses the SAME rule-based scoring engine the editor uses
 *     (ResumeService.scoreFreeText → computeAtsScore) — no Groq/AI call;
 *   - processes the pasted text entirely IN MEMORY. Nothing is written
 *     to the database, to logs, or to any queue. The text lives only
 *     for the duration of this request (privacy: see the `disclaimer`
 *     field in the response, which states the same to the visitor);
 *   - is rate limited per client IP (3 checks / 24 h) with a C-004
 *     style message that names the limit and the remediation (sign up).
 */

const PUBLIC_ATS_CHECK_MAX_CHARS = 20_000;
const PUBLIC_ATS_CHECK_LIMIT = 3;
const PUBLIC_ATS_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

export const PUBLIC_ATS_CHECK_RATE_LIMIT_MESSAGE =
  `Free anonymous ATS checks are limited to ${PUBLIC_ATS_CHECK_LIMIT} per day. ` +
  'Create a free account for unlimited ATS checks, the recruiter-view simulator, and AI fixes.';

const PUBLIC_ATS_CHECK_DISCLAIMER =
  'Your resume text was scored in memory and immediately discarded — it was not stored, logged, or used for training. ' +
  'This is the same rule-based ATS engine the CallbackCV editor uses; no AI model saw your text.';

type PublicAtsCheckBody = { resumeText?: unknown };

@Controller('public')
export class PublicAtsCheckController {
  constructor(private readonly resume: ResumeService) {}

  @Post('ats-check')
  async atsCheck(@Req() req: Request, @Body() body: PublicAtsCheckBody) {
    const resumeText = typeof body?.resumeText === 'string' ? body.resumeText.trim() : '';
    if (!resumeText) {
      throw new BadRequestException('resumeText (string) is required.');
    }
    if (resumeText.length > PUBLIC_ATS_CHECK_MAX_CHARS) {
      throw new BadRequestException(
        `resumeText too large (max ${PUBLIC_ATS_CHECK_MAX_CHARS.toLocaleString('en-US')} characters). Paste the resume body only.`,
      );
    }

    rateLimitOrThrow({
      key: `public-ats-check:${clientIpFromRequest(req)}`,
      limit: PUBLIC_ATS_CHECK_LIMIT,
      windowMs: PUBLIC_ATS_CHECK_WINDOW_MS,
      message: PUBLIC_ATS_CHECK_RATE_LIMIT_MESSAGE,
    });

    // Same engine as the editor's ATS check; stateless, no persistence,
    // no quota rows touched (there is no user in scope).
    const result = await this.resume.scoreFreeText({ resumeText });

    const topIssues = [...result.rejectionReasons, ...result.improvementSuggestions]
      .filter((issue, index, all) => all.indexOf(issue) === index)
      .slice(0, 5);

    return {
      atsScore: result.atsScore,
      band: bandForScore(result.atsScore),
      topIssues,
      missingSections: detectMissingSections(resumeText),
      disclaimer: PUBLIC_ATS_CHECK_DISCLAIMER,
    };
  }
}

/**
 * Client IP for rate-limit keying. main.ts sets `trust proxy = 1`
 * (Render sits one hop in front), so Express already resolves req.ip
 * from X-Forwarded-For — but we read the first XFF value explicitly as
 * the primary source so the keying is deterministic in tests and in
 * any deployment where trust proxy differs.
 */
export function clientIpFromRequest(req: Request): string {
  const xff = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  if (typeof first === 'string' && first.trim()) {
    return first.split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

export function bandForScore(score: number): 'strong' | 'promising' | 'needs-work' | 'at-risk' {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'promising';
  if (score >= 45) return 'needs-work';
  return 'at-risk';
}

/**
 * Same heading heuristics ResumeService.scoreFreeText applies when it
 * infers section presence from plain text — kept in lockstep so the
 * `missingSections` list explains the score it accompanies.
 */
export function detectMissingSections(resumeText: string): string[] {
  const lc = resumeText.toLowerCase();
  const missing: string[] = [];
  if (!/\bsummary|\bobjective|\babout\b/.test(lc)) missing.push('Summary');
  if (!/\bexperience|\bemployment|\bwork history\b/.test(lc)) missing.push('Experience');
  if (!/\beducation|\bacademics?\b/.test(lc)) missing.push('Education');
  if (!/\bskills?\b/.test(lc)) missing.push('Skills');
  return missing;
}
