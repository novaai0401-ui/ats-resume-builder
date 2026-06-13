import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExtractionService } from './extraction.service';

/**
 * Generic structured-extraction API. POST a document's text plus a target
 * ExtractionSchema; get back typed data with per-field confidence + provenance.
 * Backed by packages/doc-extract.
 */
@Controller('extract')
@UseGuards(JwtAuthGuard)
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}

  @Post()
  extract(@Req() req: { user: { userId: string } }, @Body() body: unknown) {
    return this.extraction.extract(req.user.userId, body);
  }
}
