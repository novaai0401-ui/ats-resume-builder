import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LiveJobsService } from '../live-jobs/live-jobs.service';
import { buildProfileJobQuery } from '../live-jobs/profile-query.util';
import { ResumeService } from '../resume/resume.service';
import { JobsService, type JobApplicationInput } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly liveJobs: LiveJobsService,
    private readonly resumes: ResumeService,
  ) {}

  /**
   * Openings matched to a saved resume.
   *
   * The query is derived from the resume rather than typed by the user — the
   * most recent job title plus a couple of skills, filtered to their city. See
   * profile-query.util.ts for why the role leads and why only a few skills go in.
   *
   * Never errors on a missing feed: with no provider configured this returns
   * `configured: false` and an empty list, so the UI can say so plainly instead
   * of rendering a failure.
   */
  @Get('matches/:resumeId')
  async matches(
    @Req() req: { user: { userId: string } },
    @Param('resumeId') resumeId: string,
    @Query('limit') limit?: string,
    @Query('where') where?: string,
  ) {
    if (!this.liveJobs.isConfigured()) {
      return { configured: false, sources: [], query: '', jobs: [] };
    }

    // Goes through ResumeService.get, which scopes by userId, so one user
    // cannot pull matches for another's resume by guessing an id.
    const resume = await this.resumes.get(req.user.userId, resumeId);
    const profile = buildProfileJobQuery(resume);
    const sources = this.liveJobs.configuredSources();

    if (profile.empty) {
      return {
        configured: true,
        sources,
        query: '',
        jobs: [],
        reason: 'Add a job title or a few skills to your resume to see matching openings.',
      };
    }

    const parsed = parseInt(String(limit ?? ''), 10);
    const resolvedLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 8;
    const resolvedWhere = (where && where.trim()) || profile.where;

    /**
     * Walk from the most specific query to the broadest, stopping at the first
     * that returns anything.
     *
     * Job APIs AND their keywords, so one precise query fails closed. A real
     * resume derived "AVP HTML5 CSS3 JavaScript" and matched nothing in a city
     * where a broader phrasing matches dozens — the feed was working and the
     * user saw "no openings". Dropping the location is the last rung, since a
     * relevant job in the next city beats none at all.
     */
    const attempts: Array<{ q: string; where?: string }> = [
      { q: profile.query, where: resolvedWhere },
      ...profile.fallbacks.map((q) => ({ q, where: resolvedWhere })),
      // Same ladder again, unfiltered by location.
      ...(resolvedWhere
        ? [profile.query, ...profile.fallbacks].map((q) => ({ q, where: undefined }))
        : []),
    ];

    // Refusals seen on the FIRST attempt. If a provider rejects the call it
    // will reject every rung, so there is no point re-reporting it five times.
    let firstFailures: string[] = [];

    for (const [index, attempt] of attempts.entries()) {
      const { jobs, failures } = await this.liveJobs.searchDetailed(attempt.q, {
        where: attempt.where,
        limit: resolvedLimit,
      });
      if (index === 0) firstFailures = failures;

      // Every configured provider refused: broadening cannot help, and telling
      // the user to try a broader role would send them chasing a fault that is
      // not theirs.
      if (failures.length >= sources.length) {
        return {
          configured: true,
          sources,
          query: attempt.q,
          where: attempt.where ?? null,
          broadened: false,
          jobs: [],
          providerErrors: failures,
          reason:
            'The job feed rejected our request, so no search could run. This is a server ' +
            'configuration issue rather than anything about your resume.',
        };
      }
      if (!jobs.length) continue;
      return {
        configured: true,
        sources,
        // Report what ACTUALLY produced these, not what we hoped would: the UI
        // shows this back to the user, so it has to be the truth.
        query: attempt.q,
        where: attempt.where ?? null,
        broadened: attempt.q !== profile.query || attempt.where !== resolvedWhere,
        jobs,
      };
    }

    return {
      configured: true,
      sources,
      query: profile.query,
      where: resolvedWhere ?? null,
      broadened: false,
      jobs: [],
      // A provider that failed on some rungs but not all still explains a thin
      // result, so pass it through rather than implying the search was clean.
      providerErrors: firstFailures,
    };
  }

  @Get()
  list(@Req() req: { user: { userId: string } }, @Query('status') status?: string) {
    return this.jobs.list(req.user.userId, status);
  }

  @Get('stats')
  stats(@Req() req: { user: { userId: string } }) {
    return this.jobs.stats(req.user.userId);
  }

  @Get('benchmark')
  benchmark(@Req() req: { user: { userId: string } }) {
    return this.jobs.benchmark(req.user.userId);
  }

  @Get('upcoming')
  upcoming(@Req() req: { user: { userId: string } }, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 14;
    const horizon = Number.isFinite(parsed) && parsed > 0 && parsed <= 180 ? parsed : 14;
    return this.jobs.upcoming(req.user.userId, horizon);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: JobApplicationInput) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.jobs.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: JobApplicationInput,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.jobs.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.jobs.remove(req.user.userId, id);
  }
}
