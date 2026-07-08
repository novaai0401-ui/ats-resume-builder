const assert = require('node:assert/strict');
const test = require('node:test');
const { DownloadChargeService } = require('../dist/billing/download-charge.service.js');
const { SupportRecoveryService } = require('../dist/admin/support-recovery.service.js');

/**
 * R-073 — paid-but-couldn't-download recovery.
 * Drives the real services with mocked prisma / mail / resume so the
 * recovery contract is pinned:
 *   • a resume already paid for is NOT charged again (idempotency);
 *   • a paid user can re-download with a lost/expired token (entitlement);
 *   • support can look up a payment by email and resend the resume by email.
 */

function makeConfig(overrides = {}) {
  const map = { ENABLE_DOWNLOAD_CHARGE: 'true', ...overrides };
  return { get: (k, def) => (map[k] !== undefined ? map[k] : def) };
}

// ── Idempotency / re-download entitlement (DownloadChargeService) ──────

test('already-paid resume is NOT charged again — returns included token', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 'u1', email: 'u@x.com', plan: 'FREE' }) },
    paymentHistory: {
      // A captured DOWNLOAD for this resume already exists.
      findFirst: async (args) =>
        args.where.status === 'captured' ? { id: 'pay1' } : null,
      create: async () => { throw new Error('should not create a new order'); },
    },
  };
  const jwt = { sign: () => 'reissued.token' };
  const svc = new DownloadChargeService(makeConfig(), prisma, jwt);
  const res = await svc.createOrder({ userId: 'u1', resumeId: 'r1', region: 'IN' });
  assert.equal(res.included, true);
  assert.equal(res.alreadyPaid, true);
  assert.equal(res.downloadToken, 'reissued.token');
});

test('hasPaidEntitlement true for paid plan, true for captured download, false otherwise', async () => {
  const mk = (plan, captured) => new DownloadChargeService(
    makeConfig(),
    {
      user: { findUnique: async () => ({ id: 'u1', plan }) },
      paymentHistory: { findFirst: async () => (captured ? { id: 'p' } : null) },
    },
    { sign: () => 't' },
  );
  assert.equal(await mk('PRO', false).hasPaidEntitlement('u1', 'r1'), true);
  assert.equal(await mk('FREE', true).hasPaidEntitlement('u1', 'r1'), true);
  assert.equal(await mk('FREE', false).hasPaidEntitlement('u1', 'r1'), false);
});

test('assertDownloadAllowed lets a paid user through even with a bad token', async () => {
  const svc = new DownloadChargeService(
    makeConfig(),
    {
      user: { findUnique: async () => ({ id: 'u1', plan: 'FREE' }) },
      paymentHistory: { findFirst: async () => ({ id: 'p' }) }, // paid
    },
    { verify: () => { throw new Error('expired'); }, sign: () => 't' },
  );
  // Bad token but paid entitlement → no throw.
  await assert.doesNotReject(() => svc.assertDownloadAllowed('garbage', 'u1', 'r1'));
});

test('assertDownloadAllowed still blocks an unpaid user with a bad token', async () => {
  const svc = new DownloadChargeService(
    makeConfig(),
    {
      user: { findUnique: async () => ({ id: 'u1', plan: 'FREE' }) },
      paymentHistory: { findFirst: async () => null }, // never paid
    },
    { verify: () => { throw new Error('expired'); }, sign: () => 't' },
  );
  await assert.rejects(() => svc.assertDownloadAllowed('garbage', 'u1', 'r1'));
});

test('reissuePaidToken throws when there is no paid entitlement', async () => {
  const svc = new DownloadChargeService(
    makeConfig(),
    {
      user: { findUnique: async () => ({ id: 'u1', plan: 'FREE' }) },
      paymentHistory: { findFirst: async () => null },
    },
    { sign: () => 't' },
  );
  await assert.rejects(() => svc.reissuePaidToken('u1', 'r1'), /No paid download/);
});

// ── Support resend (SupportRecoveryService) ───────────────────────────

function makeRecovery({ payment, mailConfigured = true } = {}) {
  const emailLogs = [];
  const fulfilled = [];
  const sends = [];
  const prisma = {
    user: { findFirst: async () => ({ id: 'u1' }), findUnique: async () => ({ email: 'buyer@x.com' }) },
    resume: { findUnique: async () => ({ title: 'My CV', userId: 'u1' }), findFirst: async () => ({ title: 'My CV' }) },
    paymentHistory: {
      findUnique: async () => payment,
      findMany: async () => (payment ? [payment] : []),
      findFirst: async () => (payment && payment.status === 'captured' ? { id: payment.id } : null),
      update: async (a) => { fulfilled.push(a); return {}; },
    },
    resumeEmailLog: {
      create: async (a) => { emailLogs.push(a.data); return {}; },
      findFirst: async () => null,
    },
  };
  const mail = {
    get isConfigured() { return mailConfigured; },
    sendResumePdfEmail: async (p) => { sends.push(p); return true; },
  };
  const resumeService = {
    generatePdfBypassingQuota: async () => Buffer.from('%PDF-1.4 fake'),
    generateDocxBypassingQuota: async () => Buffer.from('PK docx fake'),
  };
  const svc = new SupportRecoveryService(prisma, mail, resumeService);
  return { svc, emailLogs, fulfilled, sends };
}

test('support resend by paymentId renders + emails the resume and logs it', async () => {
  const payment = { id: 'pay1', userId: 'u1', resumeId: 'r1', email: 'buyer@x.com', status: 'captured' };
  const { svc, emailLogs, fulfilled, sends } = makeRecovery({ payment });
  const res = await svc.resend({ paymentId: 'pay1' });
  assert.equal(res.sent, true);
  assert.equal(res.to, 'buyer@x.com');
  assert.equal(res.format, 'pdf');
  assert.equal(sends.length, 1);
  assert.match(sends[0].fileName, /\.pdf$/);
  assert.equal(emailLogs[0].kind, 'admin_resend');
  assert.equal(emailLogs[0].status, 'sent');
  assert.equal(fulfilled.length, 1); // payment stamped fulfilled
});

test('support resend can send a DOCX', async () => {
  const payment = { id: 'pay1', userId: 'u1', resumeId: 'r1', email: 'buyer@x.com', status: 'captured' };
  const { svc, sends } = makeRecovery({ payment });
  const res = await svc.resend({ paymentId: 'pay1', format: 'docx' });
  assert.equal(res.format, 'docx');
  assert.match(sends[0].fileName, /\.docx$/);
  assert.match(sends[0].contentType, /wordprocessingml/);
});

test('support resend fails clearly when SMTP is not configured', async () => {
  const payment = { id: 'pay1', userId: 'u1', resumeId: 'r1', email: 'buyer@x.com', status: 'captured' };
  const { svc } = makeRecovery({ payment, mailConfigured: false });
  await assert.rejects(() => svc.resend({ paymentId: 'pay1' }), /not configured/i);
});

test('support lookup surfaces needsResend for a captured-but-unfulfilled payment', async () => {
  const payment = {
    id: 'pay1', userId: 'u1', resumeId: 'r1', email: 'buyer@x.com',
    status: 'captured', fulfilledAt: null, amountPaise: 4900, currency: 'INR',
    paymentProvider: 'razorpay', providerOrderId: 'order_1', providerPaymentId: 'pay_1',
    createdAt: new Date('2026-07-08T00:00:00Z'),
  };
  const { svc } = makeRecovery({ payment });
  const out = await svc.lookupPayments({ email: 'buyer@x.com' });
  assert.equal(out.count, 1);
  assert.equal(out.payments[0].needsResend, true);
  assert.equal(out.payments[0].resumeTitle, 'My CV');
});

test('support lookup requires at least one query field', async () => {
  const { svc } = makeRecovery({ payment: null });
  await assert.rejects(() => svc.lookupPayments({}), /at least one/i);
});
