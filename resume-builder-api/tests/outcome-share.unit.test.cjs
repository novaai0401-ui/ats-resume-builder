const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildOutcomeCard,
  signOutcomeCard,
  verifyOutcomeCard,
} = require('../dist/resume/outcome-share.js');
const { computeOutcomeReport } = require('../dist/resume/outcome-stats.js');

const SECRET = 'test-secret-key';

function reportWithData() {
  const versions = [
    { id: 'v1', label: 'v1', createdAt: '2026-01-01T00:00:00.000Z', atsScore: 60 },
    { id: 'v2', label: 'v2', createdAt: '2026-02-01T00:00:00.000Z', atsScore: 82 },
  ];
  const apps = [];
  // v1: 5 applied, 1 response
  for (let i = 0; i < 5; i++) apps.push({ resumeVersionId: 'v1', status: i === 0 ? 'interview' : 'applied', createdAt: '2026-01-05' });
  // v2: 5 applied, 3 responses
  for (let i = 0; i < 5; i++) apps.push({ resumeVersionId: 'v2', status: i < 3 ? 'interview' : 'applied', createdAt: '2026-02-05' });
  return computeOutcomeReport(versions, apps);
}

test('sign/verify round-trips a card', () => {
  const card = buildOutcomeCard(reportWithData());
  const token = signOutcomeCard(card, SECRET);
  const decoded = verifyOutcomeCard(token, SECRET);
  assert.deepEqual(decoded, card);
});

test('verify rejects a tampered payload', () => {
  const card = buildOutcomeCard(reportWithData());
  const token = signOutcomeCard(card, SECRET);
  const [payload, sig] = token.split('.');
  // flip a character in the payload
  const tampered = (payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A')) + '.' + sig;
  assert.equal(verifyOutcomeCard(tampered, SECRET), null);
});

test('verify rejects a wrong secret', () => {
  const card = buildOutcomeCard(reportWithData());
  const token = signOutcomeCard(card, SECRET);
  assert.equal(verifyOutcomeCard(token, 'other-secret'), null);
});

test('verify rejects garbage tokens', () => {
  assert.equal(verifyOutcomeCard('', SECRET), null);
  assert.equal(verifyOutcomeCard('nodot', SECRET), null);
  assert.equal(verifyOutcomeCard('.justsig', SECRET), null);
});

test('card is anonymized: only numbers + trend, no labels', () => {
  const card = buildOutcomeCard(reportWithData());
  assert.equal(card.v, 1);
  assert.equal(card.applied, 10);
  assert.equal(card.responses, 4); // 1 + 3
  assert.equal(card.callbackRate, 40); // 4/10
  assert.equal(card.trend.length, 2);
  assert.deepEqual(Object.keys(card.trend[0]).sort(), ['callback', 'n', 'score']);
  // No version labels or ids leak into the card.
  assert.equal(JSON.stringify(card).includes('v1'), false);
  assert.equal(JSON.stringify(card).includes('v2'), false);
});

test('trend reflects scores chronologically and nulls low-sample callback', () => {
  const versions = [
    { id: 'a', label: 'a', createdAt: '2026-01-01T00:00:00.000Z', atsScore: 50 },
    { id: 'b', label: 'b', createdAt: '2026-03-01T00:00:00.000Z', atsScore: 90 },
  ];
  // 'a' has only 2 applications -> not significant -> callback null
  const apps = [
    { resumeVersionId: 'a', status: 'applied', createdAt: '2026-01-02' },
    { resumeVersionId: 'a', status: 'interview', createdAt: '2026-01-03' },
  ];
  const card = buildOutcomeCard(computeOutcomeReport(versions, apps));
  assert.equal(card.trend[0].score, 50);
  assert.equal(card.trend[0].callback, null);
});
