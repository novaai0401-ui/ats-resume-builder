'use strict';

/**
 * R-102 — anonymous resume parse (POST /public/parse-upload).
 *
 * The contract this pins:
 *   • the route carries NO auth guard (that is the whole point — a
 *     first-time visitor must be able to upload before signing up);
 *   • it never passes a userId downstream, so neither the training-dataset
 *     nor the pattern-learner capture can run for an anonymous upload;
 *   • it is IP rate limited, because parsing (OCR especially) is the most
 *     expensive anonymous work we do;
 *   • it applies the SAME file validation as the authed route — shared via
 *     src/resume/upload-validation.ts so the two can't drift.
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  PublicParseUploadController,
  PUBLIC_PARSE_RATE_LIMIT_MESSAGE,
} = require('../dist/public-api/public-parse-upload.controller.js');
const {
  SUPPORTED_UPLOAD_MIME_TYPES,
  SUPPORTED_UPLOAD_EXTENSIONS,
  detectMimeFromMagicBytes,
  sanitizeFileName,
  extensionFromName,
} = require('../dist/resume/upload-validation.js');

const pdfBuffer = () => Buffer.concat([Buffer.from('%PDF'), Buffer.from('-1.7 rest of file')]);

function fakeRequest(ip) {
  return { headers: {}, ip, socket: { remoteAddress: ip } };
}

function controllerWithSpy() {
  const calls = [];
  const resumeService = {
    parseResumeUpload: async (file, options) => {
      calls.push({ file, options });
      return { ok: true };
    },
  };
  return { controller: new PublicParseUploadController(resumeService), calls };
}

describe('R-102 anonymous parse route', () => {
  it('has no auth guard on the controller', () => {
    // Nest records guards as metadata; the authed ResumeController has
    // __guards__, this one must not.
    const guards = Reflect.getMetadata
      ? Reflect.getMetadata('__guards__', PublicParseUploadController)
      : undefined;
    assert.ok(!guards || guards.length === 0, 'public parse must stay unauthenticated');
  });

  it('parses an anonymous upload without a userId or resumeId', async () => {
    const { controller, calls } = controllerWithSpy();
    const result = await controller.parseUpload(
      fakeRequest('203.0.113.10'),
      { title: 'My CV' },
      { originalname: 'cv.pdf', mimetype: 'application/pdf', size: 1234, buffer: pdfBuffer() },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.userId, undefined, 'no userId → no training capture');
    assert.equal(calls[0].options.resumeId, undefined, 'anonymous upload attaches to no resume');
    assert.equal(calls[0].options.title, 'My CV');
  });

  it('sanitizes the filename before it reaches the parser', async () => {
    const { controller, calls } = controllerWithSpy();
    await controller.parseUpload(
      fakeRequest('203.0.113.11'),
      {},
      { originalname: '../../etc/passwd.pdf', mimetype: 'application/pdf', size: 10, buffer: pdfBuffer() },
    );
    assert.ok(!calls[0].file.originalname.includes('..'), 'path traversal stripped');
    assert.ok(!calls[0].file.originalname.includes('/'), 'separators stripped');
  });

  it('rejects an empty file buffer instead of parsing garbage', () => {
    const { controller } = controllerWithSpy();
    // Validation throws synchronously, before any parsing work is queued.
    assert.throws(
      () => controller.parseUpload(
        fakeRequest('203.0.113.13'),
        {},
        { originalname: 'empty.pdf', mimetype: 'application/pdf', size: 0, buffer: Buffer.alloc(0) },
      ),
      (err) => /empty/i.test(JSON.stringify(err.getResponse())),
    );
  });

  it('rejects a request with no file at all', () => {
    const { controller } = controllerWithSpy();
    assert.throws(
      () => controller.parseUpload(fakeRequest('203.0.113.14'), {}, undefined),
      (err) => /file field missing/i.test(JSON.stringify(err.getResponse())),
    );
  });

  it('rate limits per IP and names the way out (C-004)', async () => {
    const { controller } = controllerWithSpy();
    const ip = '203.0.113.99';
    const file = { originalname: 'cv.pdf', mimetype: 'application/pdf', size: 10, buffer: pdfBuffer() };
    for (let i = 0; i < 5; i += 1) {
      await controller.parseUpload(fakeRequest(ip), {}, file);
    }
    assert.throws(
      () => controller.parseUpload(fakeRequest(ip), {}, file),
      (err) => {
        const body = err.getResponse ? err.getResponse() : err.message;
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        assert.match(text, /limited to 5 uploads per day/i);
        assert.match(text, /free account/i);
        return true;
      },
    );
    // A different visitor is unaffected.
    await controller.parseUpload(fakeRequest('203.0.113.100'), {}, file);
  });

  it('rate-limit copy names both the limit and the remedy', () => {
    assert.match(PUBLIC_PARSE_RATE_LIMIT_MESSAGE, /5 uploads per day/i);
    assert.match(PUBLIC_PARSE_RATE_LIMIT_MESSAGE, /free account/i);
  });
});

describe('R-102 shared upload validation', () => {
  it('is the single source of truth for accepted formats', () => {
    assert.ok(SUPPORTED_UPLOAD_MIME_TYPES.has('application/pdf'));
    assert.ok(SUPPORTED_UPLOAD_EXTENSIONS.has('docx'));
    assert.equal(extensionFromName('Resume.FINAL.PDF'), 'pdf');
  });

  it('keeps the magic-byte and filename guards intact', () => {
    assert.equal(detectMimeFromMagicBytes(pdfBuffer()), 'application/pdf');
    assert.equal(sanitizeFileName('../../evil<>.pdf').includes('..'), false);
  });
});
