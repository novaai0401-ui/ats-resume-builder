'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('recommendNextSkills returns deterministic output for the same input', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const input = {
    industryId: 'it',
    roleId: 'frontend-engineer',
    currentSkills: ['HTML', 'CSS', 'JavaScript'],
    limit: 5,
  };
  const a = recommendNextSkills(input);
  const b = recommendNextSkills(input);
  assert.deepEqual(a, b, 'engine must be pure / deterministic');
});

test('recommendNextSkills never recommends a skill the user already has', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const result = recommendNextSkills({
    industryId: 'it',
    roleId: 'frontend-engineer',
    currentSkills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React'],
    limit: 10,
  });
  const owned = new Set(['html', 'css', 'javascript', 'typescript', 'react']);
  for (const rec of result.recommendations) {
    assert.equal(owned.has(rec.skill.toLowerCase()), false,
      `engine recommended already-owned skill: ${rec.skill}`);
  }
});

test('recommendNextSkills surfaces core role skills for a beginner', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const result = recommendNextSkills({
    industryId: 'it',
    roleId: 'frontend-engineer',
    currentSkills: [],
    limit: 5,
  });
  const top = result.recommendations.map((r) => r.skill);
  // Core role skills (HTML/CSS/JS/TS/React) should dominate the top slots
  // for someone with no skills.
  const coreFound = ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React']
    .filter((s) => top.includes(s));
  assert.ok(coreFound.length >= 3,
    `expected at least 3 core frontend skills in top 5, got ${JSON.stringify(top)}`);
});

test('probabilities in the top-N are normalized and non-negative', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const result = recommendNextSkills({
    industryId: 'healthcare',
    roleId: 'registered-nurse',
    currentSkills: ['Patient Care'],
    limit: 8,
  });
  for (const rec of result.recommendations) {
    assert.ok(rec.probability >= 0, `negative probability for ${rec.skill}`);
    assert.ok(rec.probability <= 1, `probability > 1 for ${rec.skill}`);
  }
});

test('readiness scales with how many core skills the user already has', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const none = recommendNextSkills({
    industryId: 'sales', roleId: 'sdr', currentSkills: [], limit: 3,
  });
  const some = recommendNextSkills({
    industryId: 'sales', roleId: 'sdr',
    currentSkills: ['Cold Outreach'], limit: 3,
  });
  const all = recommendNextSkills({
    industryId: 'sales', roleId: 'sdr',
    currentSkills: ['Cold Outreach', 'Lead Qualification', 'CRM (HubSpot, Salesforce)'],
    limit: 3,
  });
  assert.equal(none.readiness, 0);
  assert.ok(some.readiness > 0 && some.readiness < 1);
  assert.equal(all.readiness, 1);
});

test('cross-industry target returns recommendations from the target industry', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const result = recommendNextSkills({
    industryId: 'bpo',
    roleId: 'technical-support-eng',
    currentSkills: ['Troubleshooting', 'Ticketing Systems'],
    targetIndustryId: 'it',
    targetRoleId: 'backend-engineer',
    limit: 5,
  });
  assert.equal(result.targetIndustry, 'Information Technology');
  assert.equal(result.targetRole, 'Backend Engineer');
  assert.ok(result.recommendations.length > 0);
});

test('pivot suggestions surface adjacent industries for a skilled user', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const result = recommendNextSkills({
    industryId: 'it',
    roleId: 'backend-engineer',
    currentSkills: ['SQL', 'Excel', 'Python'],
    limit: 4,
  });
  assert.ok(Array.isArray(result.pivots));
  // Skills like SQL/Excel exist in Finance too — finance should be a pivot
  const finance = result.pivots.find((p) => p.industryId === 'finance');
  assert.ok(finance, 'expected finance to appear as a pivot for SQL+Excel+Python user');
  assert.ok(finance.alignment > 0);
});

test('engine throws on unknown industry or role ids', async () => {
  const { recommendNextSkills } = await sharedPromise;
  assert.throws(() => recommendNextSkills({
    industryId: 'wizardry', roleId: 'wand-maker', currentSkills: [],
  }), /Unknown industry/);
  assert.throws(() => recommendNextSkills({
    industryId: 'it', roleId: 'not-a-real-role', currentSkills: [],
  }), /Unknown role/);
});

test('limit is clamped into the [1, 20] range', async () => {
  const { recommendNextSkills } = await sharedPromise;
  const huge = recommendNextSkills({
    industryId: 'it', roleId: 'frontend-engineer', currentSkills: [], limit: 999,
  });
  assert.ok(huge.recommendations.length <= 20);
  const tiny = recommendNextSkills({
    industryId: 'it', roleId: 'frontend-engineer', currentSkills: [], limit: 0,
  });
  assert.equal(tiny.recommendations.length >= 1, true);
});
