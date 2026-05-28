import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResumeService } from './resume.service';
import {
  AtsScoreRequestSchema,
  CreateResumeSchema,
  DuplicateResumeSchema,
  UpdateResumeSchema,
  type AtsScoreRequestDto,
  type CreateResumeDto,
  type DuplicateResumeDto,
  type UpdateResumeDto,
} from 'resume-builder-shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DownloadChargeService } from '../billing/download-charge.service';
import { MulterUploadExceptionFilter } from './multer-upload-exception.filter';
import { ResumeVersionsService } from './resume-versions.service';
import { z } from 'zod';

const { memoryStorage } = require('multer');
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/html',
  'application/rtf',
  'text/rtf',
  // Image types for OCR-based resume extraction
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const optionalTrimmedString = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional(),
  );

const ParseUploadBodySchema = z.object({
  resumeId: optionalTrimmedString(),
  title: optionalTrimmedString(),
  mode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['extract-only', 'extract-and-map']).optional(),
  ),
}).passthrough();

type UploadedResumeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('resumes')
@UseGuards(JwtAuthGuard)
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly downloadCharge: DownloadChargeService,
    private readonly versionsService: ResumeVersionsService,
  ) {}

  @Get(':id/versions')
  listVersions(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.versionsService.list(req.user.userId, id);
  }

  @Post(':id/versions')
  createVersion(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: { label?: string; atsScoreSnapshot?: number },
  ) {
    return this.versionsService.snapshot(
      req.user.userId,
      id,
      typeof body?.label === 'string' ? body.label : undefined,
      typeof body?.atsScoreSnapshot === 'number' ? body.atsScoreSnapshot : undefined,
    );
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.restore(req.user.userId, id, versionId);
  }

  @Delete(':id/versions/:versionId')
  deleteVersion(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionsService.remove(req.user.userId, id, versionId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: CreateResumeDto) {
    const parsed = CreateResumeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(buildZodErrorPayload(parsed.error));
    }
    return this.resumeService.create(req.user.userId, parsed.data);
  }

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.resumeService.list(req.user.userId);
  }

  @Get(':id')
  get(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.resumeService.get(req.user.userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: UpdateResumeDto,
  ) {
    const parsed = UpdateResumeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(buildZodErrorPayload(parsed.error));
    }
    return this.resumeService.update(req.user.userId, id, parsed.data);
  }

  @Post(':id/duplicate')
  duplicate(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: DuplicateResumeDto,
  ) {
    const parsed = DuplicateResumeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(buildZodErrorPayload(parsed.error));
    }
    return this.resumeService.duplicate(req.user.userId, id, parsed.data.title);
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.resumeService.remove(req.user.userId, id);
  }

  @Post(':id/ats-score')
  atsScore(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: AtsScoreRequestDto,
  ) {
    const parsed = AtsScoreRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(buildZodErrorPayload(parsed.error));
    }
    return this.resumeService.atsScoreForResume(req.user.userId, id, parsed.data.jdText);
  }

  /**
   * Stateless ATS score for resumes that live on the user's device.
   *
   * The privacy-mode mobile and PWA clients don't have a server-side
   * resume row to look up by ID, so they POST the content here. We run
   * scoring in-memory and return the result. Nothing is persisted —
   * no row created, no log line containing the resume body, no AI
   * provider hand-off that retains state. Same plan limits and rate
   * limits apply as the by-ID endpoint.
   */
  @Post('ats-score-content')
  @HttpCode(200)
  atsScoreContent(
    @Req() req: { user: { userId: string } },
    @Body() body: { resume: unknown; jdText?: string },
  ) {
    if (!body?.resume || typeof body.resume !== 'object') {
      throw new BadRequestException('resume payload is required.');
    }
    const jdText = typeof body.jdText === 'string' ? body.jdText : undefined;
    return this.resumeService.atsScoreForContent(req.user.userId, body.resume as Record<string, unknown>, jdText);
  }

  @Get(':id/pdf')
  async pdf(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Query('templateId') templateId: string | undefined,
    @Query('debug') debug: string | undefined,
    @Query('downloadToken') downloadToken: string | undefined,
    @Res() res: Response,
  ) {
    if (debug === 'html') {
      if (process.env.NODE_ENV === 'production') {
        throw new NotFoundException('Not found');
      }
      const rendered = await this.resumeService.debugExportHtml(req.user.userId, id, templateId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Template-Id', rendered.templateId);
      res.send(rendered.html);
      return;
    }
    if (this.downloadCharge.isFeatureEnabled()) {
      this.downloadCharge.assertDownloadToken(String(downloadToken || ''), req.user.userId, id);
    }
    const pdfBuffer = await this.resumeService.generatePdf(req.user.userId, id, templateId);
    const filename = await this.resumeService.buildExportFileName(req.user.userId, id, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  }

  /**
   * DOCX export. Same auth + payment gate as the PDF route. We render
   * the resume into a Word-compatible document built from the structured
   * resume fields (not the styled HTML), which keeps the file ATS-safe
   * and small (~10–30 KB).
   */
  @Get(':id/docx')
  async docx(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Query('downloadToken') downloadToken: string | undefined,
    @Res() res: Response,
  ) {
    if (this.downloadCharge.isFeatureEnabled()) {
      this.downloadCharge.assertDownloadToken(String(downloadToken || ''), req.user.userId, id);
    }
    const buffer = await this.resumeService.generateDocx(req.user.userId, id);
    const filename = await this.resumeService.buildExportFileName(req.user.userId, id, 'docx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('debug/export-html')
  async debugExportHtml(
    @Req() req: { user: { userId: string } },
    @Query('resumeId') resumeId: string | undefined,
    @Query('templateId') templateId: string | undefined,
    @Res() res: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Not found');
    }
    const targetResumeId = String(resumeId || '').trim();
    if (!targetResumeId) {
      throw new BadRequestException({ errors: [{ path: 'resumeId', message: 'resumeId is required.' }] });
    }
    const rendered = await this.resumeService.debugExportHtml(req.user.userId, targetResumeId, templateId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Template-Id', rendered.templateId);
    res.send(rendered.html);
  }

  @Post('parse-upload')
  @HttpCode(200)
  @UseFilters(MulterUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (req: Request & { fileValidationError?: string }, file: UploadedResumeFile, cb: (error: Error | null, acceptFile: boolean) => void) => {
        const ext = extensionFromName(file.originalname);
        const mime = String(file.mimetype || '').toLowerCase();
        const SUPPORTED_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'txt', 'html', 'htm', 'rtf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff']);
        const isSupported = SUPPORTED_UPLOAD_MIME_TYPES.has(mime) || SUPPORTED_EXTENSIONS.has(ext);
        if (isSupported) {
          cb(null, true);
          return;
        }
        req.fileValidationError = `unsupported mimetype: ${file.mimetype || 'unknown'}; allowed types are PDF, DOCX, DOC, TXT, HTML, RTF.`;
        cb(null, false);
      },
    }),
  )
  parseUpload(
    @Req() req: Request & { fileValidationError?: string },
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    const parsedBody = ParseUploadBodySchema.safeParse(body || {});
    if (!parsedBody.success) {
      const errors = parsedBody.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      logUploadReason(`body validation failed: ${errors.map((item) => `${item.path}: ${item.message}`).join(' | ')}`);
      throw new BadRequestException({ errors });
    }
    if (req.fileValidationError) {
      logUploadReason(req.fileValidationError);
      throw new BadRequestException({ errors: [{ path: 'file', message: req.fileValidationError }] });
    }
    if (!file) {
      const reason = "file field missing; expected multipart field 'file'.";
      logUploadReason(reason);
      throw new BadRequestException({ errors: [{ path: 'file', message: reason }] });
    }
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      const reason = 'uploaded file buffer is empty; ensure multipart/form-data includes a valid file payload.';
      logUploadReason(reason);
      throw new BadRequestException({ errors: [{ path: 'file', message: reason }] });
    }
    // Security: validate magic bytes match claimed MIME type
    const magicMime = detectMimeFromMagicBytes(file.buffer);
    if (magicMime && !SUPPORTED_UPLOAD_MIME_TYPES.has(magicMime)) {
      const reason = `File content does not match a supported format. Detected: ${magicMime}`;
      logUploadReason(reason);
      throw new BadRequestException({ errors: [{ path: 'file', message: reason }] });
    }
    // Security: sanitize filename to prevent path traversal
    const sanitizedName = sanitizeFileName(file.originalname);
    const userId = (req as Request & { user?: { userId?: string } }).user?.userId;
    return this.resumeService.parseResumeUpload({
      originalname: sanitizedName,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    }, { ...parsedBody.data, userId });
  }
}

function extensionFromName(name: string) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

/**
 * Detect MIME type from file magic bytes for content-type verification.
 * Returns null if the format is not recognized.
 */
function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  // PDF: starts with %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  // ZIP (DOCX is a ZIP archive): starts with PK
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  // PNG: starts with 0x89504E47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: starts with 0xFFD8FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // BMP: starts with BM
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image/bmp';
  }
  // RTF: starts with {\rtf
  if (buffer[0] === 0x7B && buffer[1] === 0x5C && buffer[2] === 0x72 && buffer[3] === 0x74) {
    return 'application/rtf';
  }
  // HTML: starts with < (loose check)
  if (buffer[0] === 0x3C) {
    return 'text/html';
  }
  return null; // Unknown - let through for text files, etc.
}

/**
 * Sanitize uploaded filename to prevent path traversal and injection attacks.
 */
function sanitizeFileName(name: string): string {
  return String(name || 'upload')
    .replace(/[/\\]/g, '_') // Remove path separators
    .replace(/\.\./g, '_')  // Remove directory traversal
    .replace(/[<>:"|?*\x00-\x1F]/g, '_') // Remove unsafe chars
    .slice(0, 255); // Limit filename length
}

function logUploadReason(message: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[parse-upload] ${message}`);
  }
}

function buildZodErrorPayload(error: any) {
  const flattened = (error && typeof error.flatten === 'function')
    ? (error.flatten() as Record<string, unknown>)
    : {};
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  return {
    ...flattened,
    errors: issues.map((issue: { path?: unknown; message?: unknown }) => {
      const pathParts = Array.isArray(issue.path) ? issue.path.map((part) => String(part)) : [];
      return {
        path: pathParts.join('.') || 'body',
        message: typeof issue.message === 'string' ? issue.message : 'Invalid request payload.',
      };
    }),
  };
}
