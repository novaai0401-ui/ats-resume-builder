const assert = require('node:assert/strict');
const test = require('node:test');
const { DownloadChargeService } = require('../dist/billing/download-charge.service.js');

/**
 * End-to-end verification of the per-download charge math by driving the
 * real service with mocked prisma / razorpay / jwt. Pins the founder's
 * agreed model:
 *   • ₹49 every download.
 *   • +₹20 flat AI fee when OUR AI improved the resume (free user).
 *   • ₹499 subscribers download FREE (included token, no Razorpay).
 */

function makeConfig(overrides = {}) {
  const map = { ENABLE_DOWNLOAD_CHARGE: 'true', ...overrides };
  return { get: (k, def) => (map[k] !== undefined ? map[k] : def) };
}

function makeService({ plan, aiAssistUsed }) {
  const clears = [];
  const prisma = {
    user: { findUnique: async () => ({ id: 'u1', email: 'u@x.com', plan }) },
    resume: {
      findFirst: async () => ({ aiAssistUsed }),
      updateMany: async (args) => { clears.push(args); return { count: 1 }; },
    },
    paymentHistory: {
      create: async () => ({}),
      // R-073: createOrder now checks for a prior paid entitlement first.
      // Default: none, so a fresh order is still created as before.
      findFirst: async () => null,
    },
  };
  const jwt = { sign: () => 'signed.download.token' };
  const svc = new DownloadChargeService(makeConfig(), prisma, jwt);
  // Inject a fake Razorpay client (constructor leaves it null without keys).
  svc.razorpay = { orders: { create: async (o) => ({ id: 'order_test', ...o }) } };
  return { svc, clears };
}

test('FREE user, AI used → ₹49 + ₹20 = ₹69, aiFee surfaced', async () => {
  const { svc } = makeService({ plan: 'FREE', aiAssistUsed: true });
  const order = await svc.createOrder({ userId: 'u1', resumeId: 'r1', region: 'IN' });
  assert.equal(order.provider, 'razorpay');
  assert.equal(order.amount, 6900);
  assert.equal(order.aiFee, 2000);
});

test('FREE user, no AI → ₹49 only, no AI fee', async () => {
  const { svc } = makeService({ plan: 'FREE', aiAssistUsed: false });
  const order = await svc.createOrder({ userId: 'u1', resumeId: 'r1', region: 'IN' });
  assert.equal(order.amount, 4900);
  assert.equal(order.aiFee, 0);
});

test('₹499 subscriber → free download (included token, no charge, flag cleared)', async () => {
  const { svc, clears } = makeService({ plan: 'PRO', aiAssistUsed: true });
  const res = await svc.createOrder({ userId: 'u1', resumeId: 'r1', region: 'IN' });
  assert.equal(res.included, true);
  assert.equal(res.downloadToken, 'signed.download.token');
  assert.equal(res.amount, undefined); // never charged
  assert.equal(clears.length, 1);      // aiAssistUsed cleared
});
