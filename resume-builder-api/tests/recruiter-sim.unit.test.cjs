const assert = require('node:assert/strict');
const test = require('node:test');
const {
  verdictForScore,
  buildRuleBasedVerdict,
  parseRecruiterSimResponse,
} = require('../dist/ai/recruiter-sim.service.js');

test('verdictForScore uses transparent thresholds', () => {
  assert.equal(verdictForScore(85), 'advance');
  assert.equal(verdictForScore(70), 'advance');
  assert.equal(verdictForScore(69), 'maybe');
  assert.equal(verdictForScore(45), 'maybe');
  assert.equal(verdictForScore(44), 'reject');
  assert.equal(verdictForScore(0), 'reject');
});

test('buildRuleBasedVerdict returns a coherent verdict for a strong match', () => {
  const resume = 'Senior engineer skilled in react, typescript, node.js, aws, docker, kubernetes, postgresql, graphql.';
  const jd = 'We need react typescript node.js aws docker kubernetes postgresql graphql experience.';
  const res = buildRuleBasedVerdict(resume, jd, []);
  assert.equal(res.provider, 'rule-based');
  assert.ok(res.score >= 70);
  assert.equal(res.verdict, 'advance');
  assert.ok(Array.isArray(res.strengths) && res.strengths.length > 0);
  assert.ok(Array.isArray(res.missingMustHaves));
});

test('buildRuleBasedVerdict flags missing must-haves for a weak match', () => {
  const resume = 'Junior writer with experience in copywriting and blogging.';
  const jd = 'Need react typescript aws kubernetes terraform graphql python machine learning.';
  const res = buildRuleBasedVerdict(resume, jd, []);
  assert.equal(res.verdict, 'reject');
  assert.ok(res.missingMustHaves.length > 0);
});

test('parseRecruiterSimResponse parses a clean JSON object', () => {
  const raw = JSON.stringify({
    verdict: 'advance',
    score: 78,
    recruiterNote: 'Strong fit.',
    strengths: ['Built scalable APIs'],
    concerns: ['No leadership signal'],
    missingMustHaves: ['terraform'],
  });
  const parsed = parseRecruiterSimResponse(raw);
  assert.equal(parsed.verdict, 'advance');
  assert.equal(parsed.score, 78);
  assert.deepEqual(parsed.strengths, ['Built scalable APIs']);
});

test('parseRecruiterSimResponse tolerates surrounding prose/fences', () => {
  const raw = 'Here is the result:\n```json\n{"verdict":"maybe","score":55}\n```\nthanks';
  const parsed = parseRecruiterSimResponse(raw);
  assert.equal(parsed.verdict, 'maybe');
  assert.equal(parsed.score, 55);
});

test('parseRecruiterSimResponse rejects an invalid verdict but keeps score', () => {
  const parsed = parseRecruiterSimResponse('{"verdict":"hire","score":90}');
  assert.equal(parsed.verdict, undefined);
  assert.equal(parsed.score, 90);
});

test('parseRecruiterSimResponse returns null on garbage', () => {
  assert.equal(parseRecruiterSimResponse('not json'), null);
  assert.equal(parseRecruiterSimResponse(''), null);
});
