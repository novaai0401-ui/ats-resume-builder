const assert = require('node:assert/strict');
const test = require('node:test');
const { redactPII } = require('../dist/pattern-learner/redact.js');
const { hasAffirmativeConsent, TRAINING_CONSENT_NOTICE } = require('../dist/training-dataset/training-dataset.service.js');

/**
 * R-112 regression. `trainingConsent` defaulted to true and capture gated
 * on that flag alone, so every user who never opened the setting was
 * enrolled — while /privacy promised "we do not use your resume to train
 * AI unless you explicitly opt in". Separately, the redactor stripped
 * emails, phones, numbers and URLs but not names, so the most identifying
 * string on a resume survived into stored samples.
 */

test('a truthy flag is not consent — the decision must be recorded', () => {
  // The exact shape of a user who never touched the setting under the old
  // default. This returned true before R-112.
  assert.equal(hasAffirmativeConsent({ trainingConsent: true, trainingConsentAt: null }), false);

  assert.equal(hasAffirmativeConsent({ trainingConsent: true, trainingConsentAt: new Date() }), true);
  assert.equal(hasAffirmativeConsent({ trainingConsent: false, trainingConsentAt: new Date() }), false);
  assert.equal(hasAffirmativeConsent(null), false);
  assert.equal(hasAffirmativeConsent(undefined), false);
});

test('the notice asks rather than announcing enrolment', () => {
  assert.doesNotMatch(TRAINING_CONSENT_NOTICE.body, /opted in by default/i);
  assert.match(TRAINING_CONSENT_NOTICE.body, /OFF unless you turn it on/i);
  // The text changed materially, so the recorded version must move with it.
  assert.ok(TRAINING_CONSENT_NOTICE.version >= 2);
});

test('the account holder’s name is redacted wherever it appears', () => {
  const text = [
    'Priya Sharma',
    'priya.sharma@example.com | +91 98765 43210',
    'Senior Engineer at Acme. Priya led the billing rewrite.',
    'References available from Sharma on request.',
  ].join('\n');

  const out = redactPII(text, { knownNames: ['Priya Sharma'] });

  assert.doesNotMatch(out, /Priya/i, 'the given name must not survive');
  assert.doesNotMatch(out, /Sharma/i, 'nor the family name, anywhere in the document');
  assert.match(out, /<NAME>/);
  // The existing guarantees still hold.
  assert.doesNotMatch(out, /priya\.sharma@example\.com/);
  assert.match(out, /<EMAIL>/);
  assert.match(out, /<PHONE>/);
  // And the structure the model learns from is preserved.
  assert.match(out, /Senior Engineer at Acme/);
});

test('a header name is redacted even when it differs from the account name', () => {
  const out = redactPII('Rahul Verma\nSoftware Engineer\nBangalore', { knownNames: ['Someone Else'] });
  assert.doesNotMatch(out, /Rahul Verma/);
  assert.match(out, /<NAME>/);
  // Non-name header lines are left alone.
  assert.match(out, /Software Engineer/);
});

test('the header heuristic does not eat section headings or job titles', () => {
  const out = redactPII('PROFESSIONAL SUMMARY\nSenior Data Engineer\nBuilt pipelines', {});
  assert.match(out, /PROFESSIONAL SUMMARY/, 'an all-caps heading is not a name');
  assert.match(out, /Built pipelines/);
});

test('redaction is resilient to regex-special characters in a name', () => {
  const out = redactPII("Work at Acme by A.J. O'Brien-Smith", { knownNames: ["A.J. O'Brien-Smith"] });
  assert.doesNotMatch(out, /O'Brien-Smith/);
  assert.match(out, /Work at Acme/);
});

test('an empty or absent name list never throws', () => {
  assert.equal(typeof redactPII('Some text', {}), 'string');
  assert.equal(typeof redactPII('Some text'), 'string');
  assert.equal(typeof redactPII('Some text', { knownNames: ['', ' ', 'A'] }), 'string');
});
