const assert = require('node:assert/strict');
const test = require('node:test');
const { computeOutcomeReport, MIN_SAMPLE_SIZE } = require('../dist/resume/outcome-stats.js');

/**
 * R-109 regression. `top` was chosen by responseRate, and RESPONSE_STATUSES
 * includes 'rejected' — so a version with five rejections outranked one
 * with an interview and four pending, and the product told the user to
 * reuse the resume that was getting them rejected. The outcome graph is
 * the moat; a metric that recommends the worse resume is the most
 * expensive bug in the product.
 */

const version = (id, label, daysAgo = 10) => ({
  id,
  label,
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  atsScore: 80,
});

const apps = (versionId, statuses) =>
  statuses.map((status, i) => ({
    resumeVersionId: versionId,
    status,
    createdAt: new Date(Date.now() - (i + 1) * 86_400_000),
    appliedAt: new Date(Date.now() - (i + 1) * 86_400_000),
  }));

test('five rejections do NOT outrank one interview', () => {
  const versions = [version('all-rejected', 'Rejected everywhere', 20), version('one-interview', 'Quietly working', 10)];
  const applications = [
    ...apps('all-rejected', ['rejected', 'rejected', 'rejected', 'rejected', 'rejected']),
    ...apps('one-interview', ['interview', 'applied', 'applied', 'applied', 'applied']),
  ];

  const report = computeOutcomeReport(versions, applications);

  assert.equal(report.top.versionId, 'one-interview', 'the version producing interviews is the one to reuse');
  // Both replied at some rate; only one replied POSITIVELY.
  const rejectedStats = report.versions.find((v) => v.versionId === 'all-rejected');
  assert.equal(rejectedStats.responseRate, 1, 'every rejection is still a reply');
  assert.equal(rejectedStats.positiveCallbackRate, 0, 'and none of them is a callback');
});

test('replies, callbacks, interviews and offers are reported separately', () => {
  const versions = [version('v1', 'V1')];
  const applications = apps('v1', ['rejected', 'phone_screen', 'interview', 'offer', 'applied']);

  const [stats] = computeOutcomeReport(versions, applications).versions;

  assert.equal(stats.applied, 5);
  assert.equal(stats.responses, 4, 'rejection counts as a reply');
  assert.equal(stats.rejections, 1);
  assert.equal(stats.positiveCallbacks, 3, 'replies minus rejections');
  assert.equal(stats.interviews, 3);
  assert.equal(stats.offers, 1);
  assert.equal(stats.offerRate, 0.2);
});

test('the headline states the counts, not just a multiplier', () => {
  const versions = [version('old', 'Original', 40), version('new', 'Tailored', 5)];
  const applications = [
    ...apps('old', ['rejected', 'applied', 'applied', 'applied', 'applied']),
    ...apps('new', ['interview', 'offer', 'phone_screen', 'applied', 'applied']),
  ];

  const { lift } = computeOutcomeReport(versions, applications);

  assert.match(lift.headline, /3\/5/, 'denominators must be on screen with the claim');
  assert.match(lift.headline, /callbacks/i);
  assert.match(lift.headline, /hint, not proof/i, 'a 5-application sample is not evidence of superiority');
});

test('rates carry the window they were observed over', () => {
  const versions = [version('v1', 'V1')];
  const applications = apps('v1', ['applied', 'interview', 'rejected', 'applied', 'applied']);

  const [stats] = computeOutcomeReport(versions, applications).versions;

  assert.ok(stats.firstAppliedAt, 'a rate without a period is not interpretable');
  assert.ok(stats.lastAppliedAt);
  assert.ok(new Date(stats.firstAppliedAt) <= new Date(stats.lastAppliedAt));
});

test('outcome provenance is counted and defaults to self-reported', () => {
  const versions = [version('v1', 'V1')];
  const applications = [
    { resumeVersionId: 'v1', status: 'interview', createdAt: new Date(), outcomeSource: 'verified' },
    { resumeVersionId: 'v1', status: 'rejected', createdAt: new Date(), outcomeSource: 'email-inferred' },
    // No outcomeSource: predates the column, and was typed in by the user.
    { resumeVersionId: 'v1', status: 'applied', createdAt: new Date() },
  ];

  const { provenance } = computeOutcomeReport(versions, applications);

  assert.deepEqual(provenance, { selfReported: 1, emailInferred: 1, verified: 1 });
});

test('below the sample threshold nothing is crowned', () => {
  const versions = [version('v1', 'V1')];
  const applications = apps('v1', ['offer']);

  const report = computeOutcomeReport(versions, applications);

  assert.equal(report.top, null, `a single application must not win on a 100% rate (MIN_SAMPLE_SIZE=${MIN_SAMPLE_SIZE})`);
  assert.equal(report.versions[0].significant, false);
});

test('ties on callbacks break toward the version with real results', () => {
  const versions = [version('screens', 'Phone screens only', 20), version('offers', 'Offers', 10)];
  const applications = [
    ...apps('screens', ['phone_screen', 'phone_screen', 'applied', 'applied', 'applied']),
    ...apps('offers', ['offer', 'offer', 'applied', 'applied', 'applied']),
  ];

  const report = computeOutcomeReport(versions, applications);

  assert.equal(report.top.versionId, 'offers', 'same callback rate — an offer beats a screen');
});

test('the dashboard hero rate does not count rejections as callbacks', () => {
  // The exact case the old code got wrong: every application rejected,
  // shown to the user as a 100% "callback rate".
  const applications = apps('v1', ['rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
  const { overall } = computeOutcomeReport([version('v1', 'V1')], applications);

  assert.equal(overall.replyRate, 1, 'they did all reply');
  assert.equal(overall.callbackRate, 0, 'and not one of them was a callback');
  assert.equal(overall.positiveCallbacks, 0);
  assert.equal(overall.rejections, 5);
});
