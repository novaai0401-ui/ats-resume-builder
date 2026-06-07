const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeHeading } = require('../dist/section-normalizer');

// Bug users reported: Languages and Certifications were never extracted
// from real-world resumes even though those sections existed in the PDF.
// Root cause: the synonym list was missing common variants like
// "Languages Known" / "Languages Spoken" / "Certifications & Licenses".
// These tests pin down the expansion so we don't regress.

test('languages: canonical phrase resolves', () => {
  assert.equal(normalizeHeading('Languages'), 'languages');
  assert.equal(normalizeHeading('LANGUAGES'), 'languages');
});

test('languages: "Languages Known" resolves (Indian-resume convention)', () => {
  assert.equal(normalizeHeading('Languages Known'), 'languages');
  assert.equal(normalizeHeading('LANGUAGES KNOWN'), 'languages');
});

test('languages: "Spoken Languages" / "Languages Spoken" resolve', () => {
  assert.equal(normalizeHeading('Spoken Languages'), 'languages');
  assert.equal(normalizeHeading('Languages Spoken'), 'languages');
});

test('languages: "Foreign Languages" resolves', () => {
  assert.equal(normalizeHeading('Foreign Languages'), 'languages');
});

test('languages: existing variants still resolve (regression guard)', () => {
  assert.equal(normalizeHeading('Language Skills'), 'languages');
  assert.equal(normalizeHeading('Language Proficiency'), 'languages');
  assert.equal(normalizeHeading('Known Languages'), 'languages');
});

test('certifications: "Certifications & Licenses" resolves', () => {
  // The normalizer strips & to whitespace, so this collapses to
  // "certifications licenses" — which the expanded synonym list now
  // recognises. Previously this fell through and the section was
  // routed to "unmapped", which is why certs never showed up.
  assert.equal(normalizeHeading('Certifications & Licenses'), 'certifications');
});

test('certifications: existing canonical variants still resolve', () => {
  assert.equal(normalizeHeading('Certifications'), 'certifications');
  assert.equal(normalizeHeading('Professional Certifications'), 'certifications');
  assert.equal(normalizeHeading('Licenses'), 'certifications');
  assert.equal(normalizeHeading('Training and Certifications'), 'certifications');
});

test('certifications: "Certs" short-form resolves', () => {
  // Common in dev-heavy / startup resumes.
  assert.equal(normalizeHeading('Certs'), 'certifications');
});

test('non-heading lines do NOT resolve to a section', () => {
  // Regression guard: don't get so loose that bullet text matches.
  assert.equal(normalizeHeading('Speaks English and Hindi at home'), '');
  assert.equal(normalizeHeading('Holds 3 active certifications'), '');
});
