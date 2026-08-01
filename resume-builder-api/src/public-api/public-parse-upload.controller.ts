import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { rateLimitOrThrow } from '../limits/rate-limit';
import { MulterUploadExceptionFilter } from '../resume/multer-upload-exception.filter';
import { ResumeService } from '../resume/resume.service';
import {
  MAX_UPLOAD_BYTES,
  ParseUploadBodySchema,
  SUPPORTED_UPLOAD_EXTENSIONS,
  SUPPORTED_UPLOAD_MIME_TYPES,
  detectMimeFromMagicBytes,
  extensionFromName,
  sanitizeFileName,
  type UploadedResumeFile,
} from '../resume/upload-validation';

/**
 * R-102 — anonymous resume parse.
 *
 * A first-time visitor must be able to upload their existing resume and see
 * it populate the editor BEFORE creating an account: that parse IS the demo,
 * and gating it behind a login wall was killing the funnel at the first
 * click. Everything downstream (saving, ATS, AI, export) still requires an
 * account — this endpoint only turns a file into JSON.
 *
 * NO auth guard on purpose. Safe because:
 *   - it is pure extraction. The parsed resume is returned to the caller and
 *     NOTHING is written: no Resume row, no training-dataset capture (that
 *     path is `userId`-gated, and an anonymous caller has none), no logs of
 *     the content;
 *   - the same validation as the authed route runs first (extension, MIME,
 *     magic-byte match, 6 MB cap, filename sanitisation);
 *   - it is rate limited per client IP, because parsing — especially the
 *     OCR path for image uploads — is the most expensive anonymous work we
 *     do. The message names the limit and the way out (C-004).
 *
 * The authed `POST /resumes/parse-upload` is unchanged: signed-in users keep
 * their higher limits and the consent-gated training capture.
 */

const PUBLIC_PARSE_LIMIT = 5;
const PUBLIC_PARSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const PUBLIC_PARSE_RATE_LIMIT_MESSAGE =
  `Anonymous resume parsing is limited to ${PUBLIC_PARSE_LIMIT} uploads per day. ` +
  'Create a free account to keep uploading — it also saves your resume so you can come back to it.';

@Controller('public')
export class PublicParseUploadController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('parse-upload')
  @HttpCode(200)
  @UseFilters(MulterUploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: require('multer').memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (
        req: Request & { fileValidationError?: string },
        file: UploadedResumeFile,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const ext = extensionFromName(file.originalname);
        const mime = String(file.mimetype || '').toLowerCase();
        if (SUPPORTED_UPLOAD_MIME_TYPES.has(mime) || SUPPORTED_UPLOAD_EXTENSIONS.has(ext)) {
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
    rateLimitOrThrow({
      key: `public-parse-upload:${clientIpFromRequest(req)}`,
      limit: PUBLIC_PARSE_LIMIT,
      windowMs: PUBLIC_PARSE_WINDOW_MS,
      message: PUBLIC_PARSE_RATE_LIMIT_MESSAGE,
    });

    const parsedBody = ParseUploadBodySchema.safeParse(body || {});
    if (!parsedBody.success) {
      throw new BadRequestException({
        errors: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      });
    }
    if (req.fileValidationError) {
      throw new BadRequestException({ errors: [{ path: 'file', message: req.fileValidationError }] });
    }
    if (!file) {
      throw new BadRequestException({
        errors: [{ path: 'file', message: "file field missing; expected multipart field 'file'." }],
      });
    }
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException({
        errors: [{ path: 'file', message: 'uploaded file buffer is empty; ensure multipart/form-data includes a valid file payload.' }],
      });
    }
    const magicMime = detectMimeFromMagicBytes(file.buffer);
    if (magicMime && !SUPPORTED_UPLOAD_MIME_TYPES.has(magicMime)) {
      throw new BadRequestException({
        errors: [{ path: 'file', message: `File content does not match a supported format. Detected: ${magicMime}` }],
      });
    }

    // Anonymous: no resumeId (there is no account to attach one to) and no
    // userId, so neither the training-dataset nor the pattern-learner
    // capture path can run. Extraction only.
    return this.resumeService.parseResumeUpload(
      {
        originalname: sanitizeFileName(file.originalname),
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      { title: parsedBody.data.title, mode: parsedBody.data.mode },
    );
  }
}

/** Same client-IP resolution the anonymous ATS check uses. */
function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}
