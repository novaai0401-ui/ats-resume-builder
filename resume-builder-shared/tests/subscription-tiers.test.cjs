'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('SUBSCRIPTION_TIERS defines FREE, PRO and ELITE in ascending price order', async () => {
  const { SUBSCRIPTION_TIERS } = await sharedPromise;
  const ids = SUBSCRIPTION_TIERS.map((t) => t.id);
  assert.deepEqual(ids, ['FREE', 'PRO', 'ELITE']);
  const prices = SUBSCRIPTION_TIERS.map((t) => t.priceUsdCents);
  for (let i = 1; i < prices.length; i++) {
    assert.ok(prices[i] > prices[i - 1], 'tiers must be ordered by ascending price');
  }
});

test('every tier has non-negative limits for usage-gated features', async () => {
  const { SUBSCRIPTION_TIERS } = await sharedPromise;
  for (const tier of SUBSCRIPTION_TIERS) {
    for (const key of ['aiTokens', 'atsScans', 'resumes', 'pdfExports', 'quantumQueries']) {
      const v = tier.limits[key];
      assert.equal(typeof v, 'number');
      assert.ok(v >= 0, `${tier.id}.limits.${key} must be >= 0`);
    }
    assert.ok(tier.features.length > 0, `${tier.id} needs at least one feature bullet`);
  }
});

test('getTier and tierAllowsQuantumQueries look up the catalog correctly', async () => {
  const { getTier, tierAllowsQuantumQueries } = await sharedPromise;
  assert.equal(getTier('FREE').name, 'Starter');
  assert.equal(getTier('PRO').highlight, true);
  assert.equal(getTier('UNKNOWN'), undefined);
  assert.equal(tierAllowsQuantumQueries('FREE'), 3);
  assert.equal(tierAllowsQuantumQueries('UNKNOWN'), 0);
});

test('higher tiers grant more or equal quota than lower tiers', async () => {
  const { SUBSCRIPTION_TIERS } = await sharedPromise;
  const [free, pro, elite] = SUBSCRIPTION_TIERS;
  for (const key of ['aiTokens', 'atsScans', 'resumes', 'pdfExports', 'quantumQueries']) {
    assert.ok(pro.limits[key] >= free.limits[key], `PRO must not undercut FREE on ${key}`);
    assert.ok(elite.limits[key] >= pro.limits[key], `ELITE must not undercut PRO on ${key}`);
  }
});
