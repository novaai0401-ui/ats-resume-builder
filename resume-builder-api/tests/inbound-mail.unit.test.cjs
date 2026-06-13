const assert = require('node:assert/strict');
const test = require('node:test');
const { __testables } = require('../dist/outcome-nudge/inbound-mail.service.js');

/**
 * R-032 mail-in outcome capture — pure-helper contract tests.
 *
 * detectOutcome writes statuses into the user's tracker from
 * UNTRUSTED email text, so the precision rules matter more than
 * recall: a missed detection costs nothing (user logs manually); a
 * false positive writes a wrong status. Every pattern requires an
 * explicit phrase.
 */

const { detectOutcome, matchApplicationsByCompany, coreCompanyName, normalizeEmail } = __testables;

test('detects rejections from the standard phrases', () => {
  for (const text of [
    'Unfortunately, we have decided to pursue other candidates.',
    'We regret to inform you that your application was unsuccessful.',
    'After careful review we will not be moving forward with your application.',
    'The position has been filled.',
  ]) {
    assert.equal(detectOutcome(text), 'rejected', text);
  }
});

test('detects interview invites', () => {
  for (const text of [
    'We would like to schedule an interview with you next week.',
    'You have been shortlisted for the next round.',
    'Sharing your availability for a call with the hiring manager.',
    'Interview scheduled for Tuesday 3pm.',
  ]) {
    assert.equal(detectOutcome(text), 'interview', text);
  }
});

test('detects offers', () => {
  for (const text of [
    'We are pleased to offer you the position of Senior Engineer.',
    'Please find your offer letter attached.',
    'We are extending an offer for the Tech Lead role.',
  ]) {
    assert.equal(detectOutcome(text), 'offer', text);
  }
});

test('precision rules: rejection outranks interview; offer outranks interview', () => {
  // "unfortunately, following your interview..." is a rejection.
  assert.equal(
    detectOutcome('Unfortunately, following your interview, we will not be moving forward.'),
    'rejected',
  );
  // "pleased to offer ... after your interview" is an offer.
  assert.equal(
    detectOutcome('We are pleased to offer you the role after your interview last week.'),
    'offer',
  );
});

test('returns null for ordinary mail — no false positives', () => {
  for (const text of [
    'Thanks for applying! We received your application.', // receipt ≠ outcome
    'Your weekly job alerts from LinkedIn.',
    'Hi, just checking in about lunch on Friday.',
    '',
  ]) {
    assert.equal(detectOutcome(text), null, JSON.stringify(text));
  }
});

test('matches applications by company with suffixes stripped both ways', () => {
  const apps = [
    { id: '1', company: 'Globex Corporation' },
    { id: '2', company: 'Initech Ltd' },
    { id: '3', company: 'Acme Tech Pvt Ltd' },
  ];
  assert.deepEqual(
    matchApplicationsByCompany(apps, 'We at Globex thank you for applying').map((a) => a.id),
    ['1'],
  );
  assert.deepEqual(
    matchApplicationsByCompany(apps, 'Your application to Acme has been received').map((a) => a.id),
    ['3'],
  );
  assert.deepEqual(
    matchApplicationsByCompany(apps, 'no companies named here').map((a) => a.id),
    [],
  );
});

test('returns multiple matches when the text is genuinely ambiguous', () => {
  const apps = [
    { id: '1', company: 'Globex Corporation' },
    { id: '2', company: 'Globex Technologies' },
  ];
  const matches = matchApplicationsByCompany(apps, 'An update from Globex about your application');
  assert.equal(matches.length, 2, 'both Globex entities must match — disambiguation handles it');
});

test('companies shorter than 3 chars never match (false-positive guard)', () => {
  const apps = [{ id: '1', company: 'GE' }];
  assert.equal(matchApplicationsByCompany(apps, 'genuinely generic words generate').length, 0);
});

test('coreCompanyName strips up to two corporate suffixes', () => {
  assert.equal(coreCompanyName('Acme Tech Pvt Ltd'), 'acme');
  assert.equal(coreCompanyName('Globex Corporation'), 'globex');
  assert.equal(coreCompanyName('Initech'), 'initech');
});

test('normalizeEmail extracts the address from display-name format', () => {
  assert.equal(normalizeEmail('Share Tester <share+test@test.io>'), 'share+test@test.io');
  assert.equal(normalizeEmail('  USER@Example.COM  '), 'user@example.com');
  assert.equal(normalizeEmail('not-an-email'), '');
  assert.equal(normalizeEmail(''), '');
});
