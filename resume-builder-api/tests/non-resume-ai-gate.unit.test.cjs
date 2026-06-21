const assert = require('node:assert/strict');
const test = require('node:test');
const { isPlanActive, NON_RESUME_AI_UPSELL } = require('../dist/ai/server-provider.js');

// Contract: non-resume AI (Mentor, Interview-Prep, Recruiter-sim,
// Skill-demand, Cover-letter) unlocks OUR AI only for paid-plan users.
// BYOK is handled separately; here we pin the plan predicate + upsell copy.

test('FREE / null / undefined plan is NOT active', () => {
  assert.equal(isPlanActive('FREE'), false);
  assert.equal(isPlanActive(null), false);
  assert.equal(isPlanActive(undefined), false);
  assert.equal(isPlanActive(''), false);
});

test('any non-FREE plan is active (single ₹499 plan reuses PRO)', () => {
  assert.equal(isPlanActive('PRO'), true);
  assert.equal(isPlanActive('STUDENT'), true);
});

test('upsell copy points to the free key and the ₹499 plan', () => {
  assert.match(NON_RESUME_AI_UPSELL, /Settings/);
  assert.match(NON_RESUME_AI_UPSELL, /₹499/);
});
