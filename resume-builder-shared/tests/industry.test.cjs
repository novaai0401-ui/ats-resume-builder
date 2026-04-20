'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('INDUSTRIES catalog covers every profession the app serves', async () => {
  const { INDUSTRIES, listIndustryIds } = await sharedPromise;
  const ids = listIndustryIds();
  // These are the industry groups we currently advertise on the marketing
  // page. Keep them in lockstep with the web pricing/navigator copy.
  for (const expected of [
    'it',
    'healthcare',
    'education',
    'bpo',
    'sales',
    'finance',
    'creative',
    'engineering',
    'hospitality',
    'legal',
  ]) {
    assert.ok(ids.includes(expected), `industry "${expected}" missing from catalog`);
  }
  // every industry should have at least one role and one skill cluster
  for (const industry of INDUSTRIES) {
    assert.ok(industry.roles.length > 0, `${industry.id} has no roles`);
    assert.ok(
      Object.keys(industry.skillClusters).length > 0,
      `${industry.id} has no skill clusters`
    );
  }
});

test('getIndustry / findRole return catalog entries and undefined for misses', async () => {
  const { getIndustry, findRole } = await sharedPromise;
  assert.equal(getIndustry('nonexistent'), undefined);
  const it = getIndustry('it');
  assert.ok(it);
  assert.equal(it.id, 'it');
  assert.ok(findRole('it', 'frontend-engineer'));
  assert.equal(findRole('it', 'not-a-role'), undefined);
});

test('allKnownSkills is deterministic and deduplicated', async () => {
  const { allKnownSkills } = await sharedPromise;
  const first = allKnownSkills();
  const second = allKnownSkills();
  assert.deepEqual(first, second);
  const set = new Set(first);
  assert.equal(set.size, first.length, 'expected no duplicate skills');
});
