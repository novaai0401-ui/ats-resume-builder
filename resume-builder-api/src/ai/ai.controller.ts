import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  AiCritiqueSchema,
  AiParseJdSchema,
  AiSkillGapSchema,
  type AiCritiqueDto,
  type AiParseJdDto,
  type AiSkillGapDto,
} from 'resume-builder-shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import type { AiCritiqueInput } from './ai.service';
import { TechGapService, type TechGapInput } from './tech-gap.service';
import { CoverLetterService, type GenerateCoverLetterInput } from './cover-letter.service';
import { BulletRewriterService, type RewriteBulletInput } from './bullet-rewriter.service';
import { JdMatchService, type JdMatchInput } from './jd-match.service';
import { InterviewPrepService, type InterviewPrepInput } from './interview-prep.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly techGapService: TechGapService,
    private readonly coverLetterService: CoverLetterService,
    private readonly bulletRewriter: BulletRewriterService,
    private readonly jdMatchService: JdMatchService,
    private readonly interviewPrepService: InterviewPrepService,
  ) {}

  @Post('parse-jd')
  parseJd(@Req() req: { user: { userId: string } }, @Body() body: AiParseJdDto) {
    const parsed = AiParseJdSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.aiService.parseJd(req.user.userId, parsed.data.text);
  }

  @Post('critique')
  critique(@Req() req: { user: { userId: string } }, @Body() body: AiCritiqueDto) {
    const parsed = AiCritiqueSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.aiService.critiqueResume(req.user.userId, parsed.data.resumeText, parsed.data.jdText);
  }

  @Post('skill-gap')
  skillGap(@Req() req: { user: { userId: string } }, @Body() body: AiSkillGapDto) {
    const parsed = AiSkillGapSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.aiService.skillGap(req.user.userId, parsed.data.resumeText, parsed.data.jdText);
  }

  @Post('ai-critique')
  aiCritique(@Req() req: { user: { userId: string } }, @Body() body: AiCritiqueInput) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.aiService.aiCritique(req.user.userId, body);
  }

  @Post('tech-gap')
  techGap(@Body() body: TechGapInput) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.techGapService.analyze(body);
  }

  @Post('cover-letter')
  generateCoverLetter(
    @Req() req: { user: { userId: string } },
    @Body() body: GenerateCoverLetterInput,
  ) {
    return this.coverLetterService.generate(req.user.userId, body);
  }

  /**
   * Per-bullet AI rewrite. Returns 3 alternative phrasings.
   * Plan-gated (Free is rejected by the service when payment-feature
   * is enabled). Falls back to rule-based variants when no AI
   * provider is configured or the call fails — the response shape is
   * identical so the client doesn't branch on it.
   */
  @Post('rewrite-bullet')
  rewriteBullet(
    @Req() req: { user: { userId: string } },
    @Body() body: RewriteBulletInput,
  ) {
    if (!body || typeof body !== 'object' || !body.currentBullet) {
      throw new BadRequestException('currentBullet is required');
    }
    return this.bulletRewriter.rewrite(req.user.userId, body);
  }

  /**
   * JD Match Score — paste a JD, get a percentage match,
   * matched/missing keywords, and three bullet suggestions to close
   * the gap. Plan-gated; rule-based fallback when LLM is unavailable.
   */
  @Post('jd-match')
  jdMatch(
    @Req() req: { user: { userId: string } },
    @Body() body: JdMatchInput,
  ) {
    if (!body || typeof body !== 'object' || !body.resumeText || !body.jdText) {
      throw new BadRequestException('resumeText and jdText are required');
    }
    return this.jdMatchService.match(req.user.userId, body);
  }

  /**
   * Interview Prep Cards — Pro only. Generate 8 likely interview
   * questions with answer outlines tailored to the user's resume.
   */
  @Post('interview-prep')
  interviewPrep(
    @Req() req: { user: { userId: string } },
    @Body() body: InterviewPrepInput,
  ) {
    if (!body || typeof body !== 'object' || !body.resumeText) {
      throw new BadRequestException('resumeText is required');
    }
    return this.interviewPrepService.generate(req.user.userId, body);
  }

  @Get('cover-letters')
  listCoverLetters(@Req() req: { user: { userId: string } }) {
    return this.coverLetterService.list(req.user.userId);
  }

  @Get('cover-letters/:id')
  getCoverLetter(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.coverLetterService.get(req.user.userId, id);
  }

  @Delete('cover-letters/:id')
  deleteCoverLetter(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.coverLetterService.remove(req.user.userId, id);
  }
}
