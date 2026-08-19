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
    const resolvedWhere = (where && where.trim()) || profile.where;
    const jobs = await this.liveJobs.search(profile.query, {
      where: resolvedWhere,
      limit: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20) : 8,
    });

    return {
      configured: true,
      sources,
      query: profile.query,
      where: resolvedWhere ?? null,
      jobs,
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
