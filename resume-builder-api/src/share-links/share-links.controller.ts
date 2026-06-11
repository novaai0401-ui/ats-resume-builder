import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShareLinksService, type CreateShareLinkInput, type UpdateShareLinkInput } from './share-links.service';

/**
 * R-038 owner-side endpoints. JWT-guarded; everything is scoped to
 * the authenticated user.
 */
@Controller('share-links')
@UseGuards(JwtAuthGuard)
export class ShareLinksController {
  constructor(private readonly service: ShareLinksService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.service.list(req.user.userId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: CreateShareLinkInput) {
    if (!body?.resumeId) throw new BadRequestException('resumeId is required.');
    return this.service.createForResume(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: UpdateShareLinkInput,
  ) {
    return this.service.update(req.user.userId, id, body || {});
  }

  @Delete(':id')
  @HttpCode(200)
  revoke(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.service.revoke(req.user.userId, id);
  }
}

/**
 * R-038 public endpoints. No auth, slug-only.
 *
 * The web app's `/p/[slug]` page calls `/p/:slug/data` for the JSON
 * body it renders. `/p/:slug/resume.pdf` is the recruiter download
 * entry point. Both are rate-limited per slug inside the service.
 *
 * Routes return a uniform 404 for the not-found / disabled / expired
 * cases — no oracle that lets a visitor distinguish "this slug never
 * existed" from "the owner just revoked it" (same as the auth
 * enumeration defence).
 */
@Controller('p')
export class PublicShareLinkController {
  constructor(private readonly service: ShareLinksService) {}

  @Get(':slug/data')
  async data(@Param('slug') slug: string, @Req() req: Request) {
    const payload = await this.service.publicPayload(slug);
    if (!payload) {
      // Plain 404 body, deliberately uninformative.
      throw new BadRequestException('This link is not available.');
    }
    // Record the view after we have served the data, fire-and-forget
    // so we never block render on the analytics path.
    void this.service.recordView(slug, req).catch(() => undefined);
    return payload;
  }

  @Get(':slug/resume.pdf')
  async pdf(@Param('slug') slug: string, @Req() req: Request, @Res() res: Response) {
    const pdf = await this.service.renderPdf(slug, req);
    const buffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf as unknown as ArrayBuffer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="resume-${slug}.pdf"`);
    res.send(buffer);
  }
}
