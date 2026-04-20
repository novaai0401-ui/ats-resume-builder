'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { BillingController } = require('../dist/billing/billing.controller.js');

/**
 * We only exercise the new public /billing/tiers endpoint here. The rest of
 * BillingController is covered by the existing e2e payment-gate tests and
 * needs the full Nest test harness (Prisma, Stripe, Razorpay) to run.
 */

test('BillingController.listTiers returns the catalog with FREE/PRO/ELITE', () => {
  // Controller methods we call don't touch the injected services, so fakes
  // are fine. This mirrors the constructor shape documented in
  // billing.controller.ts.
  const controller = new BillingController({}, {});
  const res = controller.listTiers();
  assert.ok(Array.isArray(res.tiers));
  const ids = res.tiers.map((t) => t.id);
  assert.deepEqual(ids, ['FREE', 'PRO', 'ELITE']);
  for (const tier of res.tiers) {
    assert.equal(typeof tier.name, 'string');
    assert.ok(tier.features.length > 0);
    assert.ok(tier.limits.quantumQueries >= 0);
  }
});
