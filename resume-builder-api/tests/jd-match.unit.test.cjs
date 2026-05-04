const assert = require('node:assert/strict');
const test = require('node:test');
const {
  clampPercent,
  computeRuleBasedMatch,
  parseJdMatchResponse,
  ruleBasedBulletSuggestions,
  tokenizeForKeywords,
} = require('../dist/ai/jd-match.service.js');

// ─────────────────────────────────────────────────────────────────────
// Pure-logic tests for the JD Match Score service. The DI'd `match`
// method is exercised by the e2e suite; these pin the helpers.
// ─────────────────────────────────────────────────────────────────────

test('clampPercent clamps to 0-100 and handles bad input', () => {
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(100), 100);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent('72'), 72);
  assert.equal(clampPercent(NaN), 0);
  assert.equal(clampPercent(null), 0);
});

test('tokenizeForKeywords lowercases + drops short tokens', () => {
  const tokens = tokenizeForKeywords('Built a React + TypeScript app');
  assert.ok(tokens.has('built'));
  assert.ok(tokens.has('react'));
  assert.ok(tokens.has('typescript'));
  assert.equal(tokens.has('a'), false, '"a" is too short, should be dropped');
});

test('computeRuleBasedMatch returns 100% when all JD skills are on the resume', () => {
  const resume = 'I built React, TypeScript, and PostgreSQL services with Docker on AWS.';
  const jd = 'Looking for someone with React, TypeScript, PostgreSQL, Docker, AWS experience.';
  const result = computeRuleBasedMatch(resume, jd, []);
  assert.equal(result.matchPercent, 100);
  assert.deepEqual(result.missingKeywords, []);
  assert.ok(result.matchedKeywords.includes('react'));
  assert.ok(result.matchedKeywords.includes('typescript'));
  assert.ok(result.matchedKeywords.includes('postgresql'));
});

test('computeRuleBasedMatch returns ~50% when half the skills are missing', () => {
  const resume = 'Built React applications with Redux state management.';
  const jd = 'Need React, Redux, Node.js, and Docker experience.';
  const result = computeRuleBasedMatch(resume, jd, []);
  assert.ok(result.matchPercent >= 40 && result.matchPercent <= 60,
    `expected ~50%, got ${result.matchPercent}`);
  assert.ok(result.missingKeywords.length > 0);
});

test('computeRuleBasedMatch picks up skills from currentSkills array', () => {
  const resume = 'Wrote backend services.';
  const jd = 'Looking for Python, Docker, Kubernetes experience.';
  // Resume text mentions none of those, but currentSkills covers Python + Docker.
  const result = computeRuleBasedMatch(resume, jd, ['Python', 'Docker']);
  assert.ok(result.matchedKeywords.includes('python'));
  assert.ok(result.matchedKeywords.includes('docker'));
  assert.ok(result.missingKeywords.includes('kubernetes'));
});

test('computeRuleBasedMatch falls back to token overlap when no known skill is in JD', () => {
  const resume = 'Wrote business documents and managed stakeholders carefully.';
  const jd = 'We need someone who can write business documents and manage stakeholders.';
  const result = computeRuleBasedMatch(resume, jd, []);
  // Decent overlap should produce a positive number.
  assert.ok(result.matchPercent > 0, 'should not return 0 when token overlap is high');
});

test('computeRuleBasedMatch handles empty inputs without crashing', () => {
  const result = computeRuleBasedMatch('', '', []);
  assert.equal(result.matchPercent, 0);
  assert.deepEqual(result.matchedKeywords, []);
  assert.deepEqual(result.missingKeywords, []);
});

test('ruleBasedBulletSuggestions produces 3 distinct suggestions', () => {
  const out = ruleBasedBulletSuggestions(['kubernetes', 'docker', 'aws']);
  assert.equal(out.length, 3);
  // All three contain a different keyword.
  assert.ok(out[0].toLowerCase().includes('kubernetes'));
  assert.ok(out[1].toLowerCase().includes('docker'));
  assert.ok(out[2].toLowerCase().includes('aws'));
});

test('ruleBasedBulletSuggestions returns [] when nothing is missing', () => {
  assert.deepEqual(ruleBasedBulletSuggestions([]), []);
});

test('parseJdMatchResponse handles a clean JSON response', () => {
  const raw = '{"matchPercent": 72, "matchedKeywords": ["react"], "missingKeywords": ["docker"], "bulletSuggestions": ["a", "b", "c"]}';
  const out = parseJdMatchResponse(raw);
  assert.ok(out);
  assert.equal(out.matchPercent, 72);
  assert.deepEqual(out.matchedKeywords, ['react']);
  assert.deepEqual(out.missingKeywords, ['docker']);
  assert.deepEqual(out.bulletSuggestions, ['a', 'b', 'c']);
});

test('parseJdMatchResponse strips wrapper text around the JSON', () => {
  const raw = 'Here is your match:\n{"matchPercent": 60, "matchedKeywords": ["x"], "missingKeywords": [], "bulletSuggestions": []}\nHope this helps!';
  const out = parseJdMatchResponse(raw);
  assert.ok(out);
  assert.equal(out.matchPercent, 60);
});

test('parseJdMatchResponse returns null on garbage input', () => {
  assert.equal(parseJdMatchResponse(''), null);
  assert.equal(parseJdMatchResponse('not json at all'), null);
  assert.equal(parseJdMatchResponse('{ not a real object'), null);
});

test('parseJdMatchResponse drops non-string array entries', () => {
  const raw = '{"matchPercent": 50, "matchedKeywords": ["react", 42, null, "node"], "missingKeywords": [], "bulletSuggestions": []}';
  const out = parseJdMatchResponse(raw);
  assert.deepEqual(out.matchedKeywords, ['react', 'node']);
});
