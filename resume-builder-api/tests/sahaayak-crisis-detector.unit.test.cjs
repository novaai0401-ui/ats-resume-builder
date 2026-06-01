const assert = require('node:assert/strict');
const test = require('node:test');
const { detectCrisis } = require('../dist/sahaayak/crisis-detector.js');

test('flags direct suicide ideation', () => {
  const r = detectCrisis("I don't want to live anymore");
  assert.equal(r.flag, true);
  assert.ok(r.signals.includes('suicide-ideation'));
  assert.ok(r.resources.length >= 1);
});

test('flags hopelessness language', () => {
  const r = detectCrisis("I'm worthless and a burden to my family");
  assert.equal(r.flag, true);
  assert.ok(r.signals.includes('hopeless'));
});

test('flags method language', () => {
  const r = detectCrisis("I keep thinking about an overdose");
  assert.equal(r.flag, true);
  assert.ok(r.signals.includes('method'));
});

test('does NOT flag ordinary frustration', () => {
  const r1 = detectCrisis("I am so tired of these rejection emails");
  const r2 = detectCrisis("This job search is killing me");
  assert.equal(r1.flag, false);
  // r2 has "killing me" idiom — current ruleset does NOT match it, by design.
  assert.equal(r2.flag, false);
});

test('returns India resources by default', () => {
  const r = detectCrisis("I want to die");
  assert.equal(r.resources[0].region, 'IN');
  assert.ok(r.resources.some((x) => x.name.includes('iCall')));
});

test('returns US resources when region=US', () => {
  const r = detectCrisis("I want to die", 'US');
  assert.equal(r.resources[0].region, 'US');
  assert.ok(r.resources.some((x) => x.phone === '988'));
});

test('global fallback always present', () => {
  const r = detectCrisis("end my life");
  assert.equal(r.resources[r.resources.length - 1].region, 'GLOBAL');
});
