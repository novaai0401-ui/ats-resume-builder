const assert = require('node:assert/strict');
const test = require('node:test');
const { applyLearnedPatterns } = require('../dist/pattern-learner/pattern-applier.js');

test('fills missing contact.phone but never overwrites', () => {
  const parsed = { contact: { fullName: 'Jane' } };
  const report = applyLearnedPatterns(
    'Phone: +91 98765 43210\nElsewhere',
    parsed,
    [{ kind: 'contact.phone', pattern: '\\+91\\s*\\d{5}\\s*\\d{5}', flags: 'i' }],
  );
  assert.equal(parsed.contact.phone, '+91 98765 43210');
  assert.equal(report.applied.length, 1);

  // second run must NOT overwrite
  const report2 = applyLearnedPatterns(
    'Phone: +91 11111 11111',
    parsed,
    [{ kind: 'contact.phone', pattern: '\\+91\\s*\\d{5}\\s*\\d{5}', flags: 'i' }],
  );
  assert.equal(parsed.contact.phone, '+91 98765 43210');
  assert.equal(report2.applied.length, 0);
  assert.equal(report2.skipped[0].reason, 'already set');
});

test('education.degree only fills when education list is empty', () => {
  const empty = {};
  const r1 = applyLearnedPatterns(
    'B.E in Computer Science, 2014',
    empty,
    [{ kind: 'education.degree', pattern: 'B\\.E[^,\\n]*', flags: 'i' }],
  );
  assert.equal(empty.education[0].degree.startsWith('B.E'), true);
  assert.equal(r1.applied.length, 1);

  const populated = { education: [{ degree: 'M.Tech' }] };
  const r2 = applyLearnedPatterns(
    'B.E in Computer Science',
    populated,
    [{ kind: 'education.degree', pattern: 'B\\.E[^,\\n]*', flags: 'i' }],
  );
  assert.equal(populated.education.length, 1);
  assert.equal(populated.education[0].degree, 'M.Tech');
  assert.equal(r2.applied.length, 0);
});

test('unsupported kind is skipped, not applied', () => {
  const parsed = {};
  const report = applyLearnedPatterns(
    '2020 - 2022',
    parsed,
    [{ kind: 'experience.dateRange', pattern: '\\d{4}\\s*-\\s*\\d{4}', flags: 'i' }],
  );
  assert.equal(report.applied.length, 0);
  assert.equal(report.skipped[0].kind, 'experience.dateRange');
});

test('invalid regex is skipped with compile-failed reason', () => {
  const parsed = {};
  const report = applyLearnedPatterns(
    'anything',
    parsed,
    [{ kind: 'contact.phone', pattern: '(a+)+b', flags: 'i' }],
  );
  assert.equal(report.applied.length, 0);
  assert.ok(report.skipped[0].reason.startsWith('compile failed'));
});
