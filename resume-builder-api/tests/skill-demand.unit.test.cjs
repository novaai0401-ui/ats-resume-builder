const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeSkillKey,
  lookupSkillDemand,
  analyzeSkillsRuleBased,
  TOP_IN_DEMAND_2026,
} = require('../dist/ai/skill-demand-data.js');
const { parseSkillDemandResponse } = require('../dist/ai/skill-demand.service.js');

test('normalizeSkillKey lowercases, trims, collapses spaces', () => {
  assert.equal(normalizeSkillKey('  Machine   Learning '), 'machine learning');
});

test('lookupSkillDemand returns known skills with full shape', () => {
  const d = lookupSkillDemand('Python');
  assert.equal(d.skill, 'Python');
  assert.equal(d.demand, 'very-high');
  assert.ok(Array.isArray(d.alsoLearn) && d.alsoLearn.length > 0);
  assert.ok(Array.isArray(d.companiesHiring) && d.companiesHiring.length > 0);
});

test('lookupSkillDemand falls back gracefully for unknown skills', () => {
  const d = lookupSkillDemand('basket weaving');
  assert.equal(d.demand, 'stable');
  assert.match(d.skill, /Basket Weaving/);
  assert.ok(d.companiesHiring.length > 0);
});

test('analyzeSkillsRuleBased dedupes and caps at 15', () => {
  const res = analyzeSkillsRuleBased(['python', 'Python', 'PYTHON']);
  assert.equal(res.length, 1);
  const many = Array.from({ length: 30 }, (_, i) => `skill${i}`);
  assert.equal(analyzeSkillsRuleBased(many).length, 15);
});

test('analyzeSkillsRuleBased skips empty entries', () => {
  const res = analyzeSkillsRuleBased(['', '   ', 'react']);
  assert.equal(res.length, 1);
  assert.equal(res[0].skill, 'React');
});

test('TOP_IN_DEMAND_2026 leads with AI', () => {
  assert.ok(TOP_IN_DEMAND_2026.length >= 6);
  assert.ok(TOP_IN_DEMAND_2026.join(' ').toLowerCase().includes('ai'));
});

test('parseSkillDemandResponse parses a clean object', () => {
  const raw = JSON.stringify({
    topInDemand: ['AI/ML', 'Cloud'],
    yourSkills: [{ skill: 'Go', demand: 'high', trend: 'Backend favorite', alsoLearn: ['Kubernetes'], companiesHiring: ['Google'] }],
  });
  const parsed = parseSkillDemandResponse(raw);
  assert.deepEqual(parsed.topInDemand, ['AI/ML', 'Cloud']);
  assert.equal(parsed.yourSkills[0].skill, 'Go');
  assert.equal(parsed.yourSkills[0].demand, 'high');
});

test('parseSkillDemandResponse coerces invalid demand to stable and drops nameless', () => {
  const raw = JSON.stringify({ yourSkills: [{ skill: 'Rust', demand: 'insane' }, { demand: 'high' }] });
  const parsed = parseSkillDemandResponse(raw);
  assert.equal(parsed.yourSkills.length, 1);
  assert.equal(parsed.yourSkills[0].demand, 'stable');
});

test('parseSkillDemandResponse tolerates surrounding prose and rejects garbage', () => {
  assert.ok(parseSkillDemandResponse('here: {"yourSkills":[{"skill":"SQL"}]} done'));
  assert.equal(parseSkillDemandResponse('nope'), null);
});
