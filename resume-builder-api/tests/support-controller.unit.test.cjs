const assert = require('node:assert/strict');
const test = require('node:test');
const { SupportController } = require('../dist/admin/support.controller.js');

// Admin "Force Export" route — escape hatch for the "I paid but my
// download failed" support flow. These tests pin the contract:
//   - validates body
//   - looks up user + resume
//   - calls generatePdf with bypassRestrictions=true (so the user
//     does not get charged a second export from their monthly quota)
//   - emails the resulting PDF and returns delivery metadata
//   - logs the action so we have an audit trail

function makeController(opts = {}) {
  const prisma = opts.prisma || {
    user: { findUnique: async () => ({ id: 'u_real', email: 'user@example.com', fullName: 'Real User' }) },
    resume: { findFirst: async () => ({ id: 'r_real', title: 'Senior Engineer' }) },
  };
  const generateCalls = [];
  const resumeService = opts.resumeService || {
    generatePdf: async (userId, resumeId, templateId, options) => {
      generateCalls.push({ userId, resumeId, templateId, options });
      return Buffer.from('%PDF-FAKE');
    },
  };
  const emailCalls = [];
  const mailService = opts.mailService || {
    isConfigured: true,
    sendResumePdfEmail: async (params) => {
      emailCalls.push(params);
      return opts.emailReturns ?? true;
    },
  };
  const ctrl = new SupportController(resumeService, prisma, mailService);
  return { ctrl, generateCalls, emailCalls };
}

// --------------------------------------------------------------------
// Body validation
// --------------------------------------------------------------------

test('rejects request with missing userId', async () => {
  const { ctrl } = makeController();
  await assert.rejects(
    () => ctrl.regenerateExport({ resumeId: 'r_real' }),
    /userId is required/,
  );
});

test('rejects request with missing resumeId', async () => {
  const { ctrl } = makeController();
  await assert.rejects(
    () => ctrl.regenerateExport({ userId: 'u_real' }),
    /resumeId is required/,
  );
});

test('rejects when user does not exist', async () => {
  const { ctrl } = makeController({
    prisma: {
      user: { findUnique: async () => null },
      resume: { findFirst: async () => null },
    },
  });
  await assert.rejects(
    () => ctrl.regenerateExport({ userId: 'u_missing', resumeId: 'r_x' }),
    /User u_missing not found/,
  );
});

test('rejects when user has no email on file', async () => {
  const { ctrl } = makeController({
    prisma: {
      user: { findUnique: async () => ({ id: 'u_real', email: '', fullName: 'No Mail' }) },
      resume: { findFirst: async () => ({ id: 'r_real', title: 'X' }) },
    },
  });
  await assert.rejects(
    () => ctrl.regenerateExport({ userId: 'u_real', resumeId: 'r_real' }),
    /has no email on file/,
  );
});

test('rejects when resume does not belong to that user', async () => {
  const { ctrl } = makeController({
    prisma: {
      user: { findUnique: async () => ({ id: 'u_real', email: 'u@x.io', fullName: 'X' }) },
      resume: { findFirst: async () => null },
    },
  });
  await assert.rejects(
    () => ctrl.regenerateExport({ userId: 'u_real', resumeId: 'r_other' }),
    /Resume r_other not found/,
  );
});

// --------------------------------------------------------------------
// Happy path: PDF regenerated, emailed, response shape correct
// --------------------------------------------------------------------

test('happy path: generates PDF with bypassRestrictions and emails it', async () => {
  const { ctrl, generateCalls, emailCalls } = makeController();
  const res = await ctrl.regenerateExport({
    userId: 'u_real',
    resumeId: 'r_real',
    reason: 'Payment captured but download server returned 500',
  });
  // CRITICAL: bypassRestrictions must be true — otherwise the admin
  // route would consume the user's monthly quota a second time.
  assert.equal(generateCalls.length, 1);
  assert.equal(generateCalls[0].options?.bypassRestrictions, true);
  assert.equal(generateCalls[0].userId, 'u_real');
  assert.equal(generateCalls[0].resumeId, 'r_real');
  // Email delivered.
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].to, 'user@example.com');
  assert.equal(emailCalls[0].resumeTitle, 'Senior Engineer');
  assert.match(emailCalls[0].fileName, /\.pdf$/);
  // Response shape.
  assert.equal(res.ok, true);
  assert.equal(res.delivered, true);
  assert.equal(res.sentTo, 'user@example.com');
  assert.equal(res.resumeId, 'r_real');
  assert.equal(res.resumeTitle, 'Senior Engineer');
  assert.equal(typeof res.pdfBytes, 'number');
  assert.ok(res.pdfBytes > 0);
});

test('passes templateId override to generatePdf when supplied', async () => {
  const { ctrl, generateCalls } = makeController();
  await ctrl.regenerateExport({
    userId: 'u_real',
    resumeId: 'r_real',
    templateId: 'modern',
  });
  assert.equal(generateCalls[0].templateId, 'modern');
});

test('returns delivered=false when SMTP send returns false (operator gets a clear signal)', async () => {
  const { ctrl, emailCalls } = makeController({ emailReturns: false });
  const res = await ctrl.regenerateExport({
    userId: 'u_real',
    resumeId: 'r_real',
  });
  assert.equal(emailCalls.length, 1);
  assert.equal(res.ok, true);
  assert.equal(res.delivered, false);
});

test('sanitises a reason longer than 280 chars (no log poisoning)', async () => {
  const { ctrl } = makeController();
  const longReason = 'X'.repeat(2000);
  const res = await ctrl.regenerateExport({
    userId: 'u_real',
    resumeId: 'r_real',
    reason: longReason,
  });
  assert.ok(res.reason);
  assert.ok(res.reason.length <= 280);
});

test('sanitises resume title characters into a safe filename', async () => {
  const { ctrl, emailCalls } = makeController({
    prisma: {
      user: { findUnique: async () => ({ id: 'u_real', email: 'u@x.io', fullName: 'X' }) },
      resume: { findFirst: async () => ({ id: 'r_real', title: 'My Resume / "draft" 2024!' }) },
    },
  });
  await ctrl.regenerateExport({ userId: 'u_real', resumeId: 'r_real' });
  const name = emailCalls[0].fileName;
  // Must not contain path separators, quotes, or shell metacharacters.
  assert.doesNotMatch(name, /[\/"!]/);
  assert.match(name, /\.pdf$/);
});
