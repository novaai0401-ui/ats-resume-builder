/**
 * Unit tests for crossVerifyUpload — the non-destructive audit layer that
 * compares the structured resume the API returns against the raw text and
 * flags likely misinterpretations. These assert it actually CATCHES the
 * failure shapes we kept shipping (missing experience, leaked headings,
 * dropped contact / education) rather than passing silently.
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { crossVerifyUpload, chooseBetterExtraction } = require('../dist/resume/resume.service.js');

const mk = (ok, warnings) => ({ id: Math.random(), verification: { ok, warnings, stats: {} } });

test('crossVerify: flags experience missing when text has dated roles', () => {
  const text = [
    'John Doe',
    'john@example.com  +1 555 123 4567',
    'WORK EXPERIENCE',
    'Software Engineer, Acme Corp  Jan 2020 - Present',
    'Senior Engineer, Globex  Mar 2017 - Dec 2019',
  ].join('\n');
  const v = crossVerifyUpload(text, {
    contact: { fullName: 'John Doe', email: 'john@example.com', phone: '+1 555 123 4567' },
    experience: [],
    education: [],
    skills: [],
  });
  assert.equal(v.ok, false);
  assert.ok(v.warnings.some((w) => /no experience entries were extracted/i.test(w)), v.warnings.join(' | '));
  assert.ok(v.stats.rawDateRanges >= 2, `expected ≥2 date ranges, got ${v.stats.rawDateRanges}`);
});

test('crossVerify: flags a section heading leaking into a company name', () => {
  const v = crossVerifyUpload('SOFT SKILLS\nName Here\njohn@x.com', {
    contact: { fullName: 'Name Here', email: 'john@x.com' },
    experience: [{ role: '(', company: 'SOFT SKILLS' }],
    education: [{}],
    skills: ['JS'],
  });
  assert.equal(v.ok, false);
  assert.ok(v.warnings.some((w) => /leaked into a company name/i.test(w)), v.warnings.join(' | '));
});

test('crossVerify: flags dropped email / phone / name', () => {
  const text = 'jane@example.com  9998887776\nSummary line';
  const v = crossVerifyUpload(text, { contact: undefined, experience: [{ role: 'Dev', company: 'Acme' }], education: [], skills: [] });
  assert.equal(v.ok, false);
  assert.ok(v.warnings.some((w) => /email/i.test(w)), 'should flag missing email');
  assert.ok(v.warnings.some((w) => /phone/i.test(w)), 'should flag missing phone');
  assert.ok(v.warnings.some((w) => /full name/i.test(w)), 'should flag missing name');
});

test('crossVerify: flags a degree present in text but no education extracted', () => {
  const text = 'Jane Roe\njane@x.com 9998887776\nB.Tech in Computer Science, Some University 2015 - 2019';
  const v = crossVerifyUpload(text, {
    contact: { fullName: 'Jane Roe', email: 'jane@x.com', phone: '9998887776' },
    experience: [{ role: 'Dev', company: 'Acme' }],
    education: [],
    skills: ['JS'],
  });
  assert.ok(v.warnings.some((w) => /degree appears/i.test(w)), v.warnings.join(' | '));
});

// ── Self-healing retry decision (chooseBetterExtraction) ──────────────────────

test('chooseBetterExtraction: keeps primary when its cross-check passes (no retry)', () => {
  const primary = mk(true, []);
  const alt = mk(true, []); // even if an alt exists, a passing primary wins
  const { chosen, reExtracted } = chooseBetterExtraction(primary, alt);
  assert.equal(chosen, primary);
  assert.equal(reExtracted, false);
});

test('chooseBetterExtraction: switches to the retry when primary failed and retry has fewer warnings', () => {
  const primary = mk(false, ['no experience entries were extracted', 'full name not detected']);
  const alt = mk(true, []);
  const { chosen, reExtracted } = chooseBetterExtraction(primary, alt);
  assert.equal(chosen, alt);
  assert.equal(reExtracted, true);
});

test('chooseBetterExtraction: keeps primary when the retry is equal or worse', () => {
  const primary = mk(false, ['one warning']);
  const worse = mk(false, ['one warning', 'two warning']);
  assert.equal(chooseBetterExtraction(primary, worse).chosen, primary);
  assert.equal(chooseBetterExtraction(primary, worse).reExtracted, false);

  const equal = mk(false, ['something else']);
  assert.equal(chooseBetterExtraction(primary, equal).chosen, primary, 'ties keep primary');
});

test('chooseBetterExtraction: keeps primary when the retry was not attempted (null)', () => {
  const primary = mk(false, ['a warning']);
  const { chosen, reExtracted } = chooseBetterExtraction(primary, null);
  assert.equal(chosen, primary);
  assert.equal(reExtracted, false);
});

test('crossVerify: clean parse reports ok=true with no warnings', () => {
  const text = [
    'Jane Roe',
    'jane@example.com  +1 555 999 0000',
    'EXPERIENCE',
    'Software Engineer, Acme Corp  Jan 2020 - Present',
    'EDUCATION',
    'B.Tech, Some University 2012 - 2016',
    'TECHNICAL SKILLS',
    'JavaScript, React',
  ].join('\n');
  const v = crossVerifyUpload(text, {
    contact: { fullName: 'Jane Roe', email: 'jane@example.com', phone: '+1 555 999 0000' },
    experience: [{ role: 'Software Engineer', company: 'Acme Corp' }],
    education: [{ degree: 'B.Tech', institution: 'Some University' }],
    skills: ['JavaScript', 'React'],
  });
  assert.equal(v.ok, true, `expected clean, got: ${v.warnings.join(' | ')}`);
});
