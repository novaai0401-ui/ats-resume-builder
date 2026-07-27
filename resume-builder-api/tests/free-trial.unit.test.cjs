'use strict';

/**
 * R-098 — "one free run per AI feature" contract.
 *
 * Tests the contract, not the implementation: the catalogue shape, the
 * availability check, and — most importantly — the exact 403 payload the web
 * client parses to open the "you've used this one" popup. If the codes or the
 * feature ledger ever drift, the popup silently degrades to a raw error
 * sentence, which is what this file exists to prevent.
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  AI_TRIAL_FEATURES,
  FREE_TRIAL_EXHAUSTED_CODE,
  FREE_TRIAL_FEATURE_USED_CODE,
  buildFreeTrialBlockedPayload,
  enforceFreeTrialOrThrow,
  getFreeTrialStatus,
  isFreeTrialAvailable,
  recordFreeTrialUse,
} = require('../dist/ai/free-trial.js');

/** Minimal in-memory stand-in for the AiFeatureTrial delegate. */
function fakePrisma(usedFeatures = []) {
  const rows = usedFeatures.map((feature) => ({ feature, usedAt: new Date('2026-07-01T00:00:00Z') }));
  return {
    upserts: [],
    aiFeatureTrial: {
      findMany: async () => rows,
      findFirst: async ({ where }) => rows.find((r) => r.feature === where.feature) || null,
      upsert: async (args) => {
        const feature = args.where.userId_feature.feature;
        if (!rows.some((r) => r.feature === feature)) rows.push({ feature, usedAt: new Date() });
        return { feature };
      },
    },
  };
}

describe('R-098 free-trial catalogue', () => {
  it('lists every AI feature exactly once, with a label and a destination', () => {
    assert.ok(AI_TRIAL_FEATURES.length >= 10, 'catalogue covers the AI surface');
    const keys = AI_TRIAL_FEATURES.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, 'no duplicate feature keys');
    for (const feature of AI_TRIAL_FEATURES) {
      assert.ok(feature.label && feature.label.length > 2, `${feature.key} has a label`);
      assert.ok(feature.href.startsWith('/'), `${feature.key} has an in-app href`);
    }
  });

  it('leads with the JD skill-gap flow', () => {
    assert.equal(AI_TRIAL_FEATURES[0].key, 'jd-match');
  });
});

describe('R-098 availability + ledger', () => {
  it('a fresh user has every feature available', async () => {
    const prisma = fakePrisma([]);
    assert.equal(await isFreeTrialAvailable(prisma, 'u1', 'jd-match'), true);
    const status = await getFreeTrialStatus(prisma, 'u1');
    assert.equal(status.usedCount, 0);
    assert.equal(status.remainingCount, AI_TRIAL_FEATURES.length);
    assert.equal(status.exhausted, false);
  });

  it('a used feature is no longer available but the others are', async () => {
    const prisma = fakePrisma(['jd-match']);
    assert.equal(await isFreeTrialAvailable(prisma, 'u1', 'jd-match'), false);
    assert.equal(await isFreeTrialAvailable(prisma, 'u1', 'cover-letter'), true);
    const status = await getFreeTrialStatus(prisma, 'u1');
    assert.equal(status.usedCount, 1);
    assert.equal(status.remainingCount, AI_TRIAL_FEATURES.length - 1);
    assert.ok(status.features.find((f) => f.key === 'jd-match').used);
    assert.equal(status.features.find((f) => f.key === 'cover-letter').used, false);
  });

  it('recording a run burns exactly that feature and is idempotent', async () => {
    const prisma = fakePrisma([]);
    await recordFreeTrialUse(prisma, 'u1', 'tech-gap');
    await recordFreeTrialUse(prisma, 'u1', 'tech-gap');
    assert.equal(await isFreeTrialAvailable(prisma, 'u1', 'tech-gap'), false);
    const status = await getFreeTrialStatus(prisma, 'u1');
    assert.equal(status.usedCount, 1, 'a repeated record does not double-count');
  });

  it('a write failure never throws — a lost log beats a failed AI response', async () => {
    const prisma = {
      aiFeatureTrial: {
        upsert: async () => { throw new Error('db down'); },
      },
    };
    await recordFreeTrialUse(prisma, 'u1', 'tech-gap');
  });

  it('trialApplies is reported honestly for exempt (BYOK / plan) users', async () => {
    const status = await getFreeTrialStatus(fakePrisma([]), 'u1', { trialApplies: false });
    assert.equal(status.trialApplies, false);
  });
});

describe('R-098 refusal payload', () => {
  it('passes an unused feature through without throwing', async () => {
    await enforceFreeTrialOrThrow(fakePrisma([]), 'u1', 'jd-match');
  });

  it('throws FREE_TRIAL_FEATURE_USED with the full ledger on a second run', async () => {
    const prisma = fakePrisma(['jd-match']);
    let thrown = null;
    try {
      await enforceFreeTrialOrThrow(prisma, 'u1', 'jd-match');
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'second run is refused');
    const body = thrown.getResponse();
    assert.equal(body.code, FREE_TRIAL_FEATURE_USED_CODE);
    assert.equal(body.feature, 'jd-match');
    assert.equal(body.exhausted, false);
    assert.equal(body.features.length, AI_TRIAL_FEATURES.length);
    assert.ok(body.remainingCount > 0, 'the popup can list what is still free');
    assert.match(body.message, /free once|one free/i);
  });

  it('switches to FREE_TRIAL_EXHAUSTED once every feature is spent', async () => {
    const prisma = fakePrisma(AI_TRIAL_FEATURES.map((f) => f.key));
    let thrown = null;
    try {
      await enforceFreeTrialOrThrow(prisma, 'u1', 'tailor');
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown);
    const body = thrown.getResponse();
    assert.equal(body.code, FREE_TRIAL_EXHAUSTED_CODE);
    assert.equal(body.exhausted, true);
    assert.equal(body.remainingCount, 0);
    assert.match(body.message, /₹499|plan/i, 'the exhausted case asks for the upgrade');
  });

  it('every refusal keeps the honest BYOK escape hatch (C-003)', () => {
    const status = {
      trialApplies: true,
      features: [],
      usedCount: 1,
      totalCount: 12,
      remainingCount: 11,
      exhausted: false,
    };
    const body = buildFreeTrialBlockedPayload('jd-match', status);
    assert.equal(body.statusCode, 403);
    assert.equal(body.byokHref, '/settings');
    assert.equal(body.upgradeHref, '/pricing');
    assert.match(body.message, /own AI key/i);
  });
});
