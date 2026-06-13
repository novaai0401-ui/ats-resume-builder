import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ApiKeyGuard, ipHashFromRequest } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { ResumeService } from '../resume/resume.service';

/**
 * R-041 — public B2B API. Three metered endpoints:
 *
 *   POST /v1/parse   — PDF/DOCX → structured resume JSON
 *   POST /v1/score   — { resumeText, jdText } → ATS score breakdown
 *   POST /v1/tailor  — { resumeText, jdText } → tailored bullet rewrites
 *
 * Stateless: parses/scores reuse the same engines the web app uses,
 * but nothing is persisted to a user account. Tenants get an opaque
 * key and pay per successful 2xx call (logged in ApiUsage; surfaced
 * via `/v1/usage`).
 *
 * Self-improvement loop: every parse failure feeds the pattern-
 * learner queue tagged with the tenant slug (separate `source`
 * field), so the parser gets better with every call without ever
 * mixing tenant uploads into the personal-user data pool.
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly resume: ResumeService,
  ) {}

  /**
   * Parse an uploaded resume file into structured JSON.
   *
   * multipart/form-data with a `file` field. Accepts PDF/DOCX/RTF/TXT
   * up to 5 MB (the same limit the editor's upload uses).
   */
  @Post('parse')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async parse(@Req() req: Request, @UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('file is required (multipart field "file").');
    return this.metered(req, 'POST /v1/parse', async () => {
      const parsed = await this.resume.parseResumeUpload(
        { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer },
        { mode: 'extract-only' },
      );
      // Public API returns a stable, documented shape — strip any
      // user-tracking metadata the internal flow happens to include.
      return {
        title: parsed.title,
        contact: parsed.contact,
        summary: parsed.summary,
        skills: parsed.skills,
        experience: parsed.experience,
        education: parsed.education,
        projects: parsed.projects,
        certifications: parsed.certifications,
        achievements: (parsed as any).achievements ?? [],
        languages: parsed.languages,
      };
    });
  }

  /**
   * Compute an ATS score for already-extracted resume text vs. a JD.
   * Stateless: nothing is persisted, no userId required.
   */
  @Post('score')
  async score(@Req() req: Request, @Body() body: { resumeText: string; jdText?: string; skills?: string[] }) {
    if (!body?.resumeText || typeof body.resumeText !== 'string') {
      throw new BadRequestException('resumeText (string) is required.');
    }
    if (body.resumeText.length > 60_000) {
      throw new BadRequestException('resumeText too large (max 60 000 chars).');
    }
    return this.metered(req, 'POST /v1/score', async () => {
      // Delegates to the same engine used by the editor's ATS check.
      // No quota increment because there's no user account in scope.
      return this.resume.scoreFreeText({
        resumeText: body.resumeText,
        jdText: String(body.jdText || '').slice(0, 20_000),
        skills: Array.isArray(body.skills) ? body.skills.slice(0, 200).map(String) : [],
      });
    });
  }

  /**
   * Tailor a resume's bullets against a JD — propose-only.
   * Tenant-side callers don't get the version-pinning machinery; the
   * proposal is a one-shot read.
   */
  @Post('tailor')
  async tailor(@Req() req: Request, @Body() body: { resumeText: string; jdText: string }) {
    if (!body?.resumeText || !body?.jdText) {
      throw new BadRequestException('resumeText and jdText are required.');
    }
    return this.metered(req, 'POST /v1/tailor', async () => {
      return this.resume.publicTailor({
        resumeText: String(body.resumeText).slice(0, 60_000),
        jdText: String(body.jdText).slice(0, 20_000),
      });
    });
  }

  /** Monthly usage for the calling key (no auth beyond the guard). */
  @Get('usage')
  usage(@Req() req: Request) {
    const apiKeyId = (req as any).apiKey?.id as string;
    return this.keys.monthlyUsage(apiKeyId);
  }

  // ── internal: meter every public call (success + failure) ───────

  private async metered<T>(req: Request, endpoint: string, fn: () => Promise<T>): Promise<T> {
    const apiKey = (req as any).apiKey as { id: string };
    const start = (req as any).apiCallStart || Date.now();
    let status = 200;
    let result: T | undefined;
    try {
      result = await fn();
      return result;
    } catch (err) {
      status = err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      throw err;
    } finally {
      // Fire-and-forget — billing is best-effort, never blocks.
      void this.keys.recordUsage({
        apiKeyId: apiKey.id,
        endpoint,
        status,
        ipHash: ipHashFromRequest(req),
        userAgent: String(req.headers['user-agent'] || '') || null,
        durationMs: Date.now() - start,
      });
    }
  }
}
