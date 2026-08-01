import { z } from 'zod';

/**
 * Upload validation shared by the authed `POST /resumes/parse-upload` and the
 * anonymous `POST /public/parse-upload` (R-102).
 *
 * Extracted so the two routes can never drift: a format the public route
 * accepts but the authed one rejects (or vice versa) would be both a support
 * puzzle and, for the magic-byte check, a security gap.
 */

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
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

export const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'txt', 'html', 'htm', 'rtf',
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff',
]);

export type UploadedResumeFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const optionalTrimmedString = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional(),
  );

export const ParseUploadBodySchema = z.object({
  resumeId: optionalTrimmedString(),
  title: optionalTrimmedString(),
  mode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['extract-only', 'extract-and-map']).optional(),
  ),
}).passthrough();

export function extensionFromName(name: string): string {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

/**
 * Detect MIME type from file magic bytes for content-type verification.
 * Returns null if the format is not recognized.
 */
export function detectMimeFromMagicBytes(buffer: Buffer): string | null {
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

/** Sanitize uploaded filename to prevent path traversal and injection attacks. */
export function sanitizeFileName(name: string): string {
  return String(name || 'upload')
    .replace(/[/\\]/g, '_') // Remove path separators
    .replace(/\.\./g, '_')  // Remove directory traversal
    .replace(/[<>:"|?*\x00-\x1F]/g, '_') // Remove unsafe chars
    .slice(0, 255); // Limit filename length
}
