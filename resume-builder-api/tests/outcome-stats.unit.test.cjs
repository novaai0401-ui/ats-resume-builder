const assert = require('node:assert/strict');
const test = require('node:test');
const { computeOutcomeReport, MIN_SAMPLE_SIZE } = require('../dist/resume/outcome-stats.js');

const day = (n) => new Date(`2026-01-${String(n).padStart(2, '0')}T00:00:00Z`);

function apps(versionId, status, count) {
  return Array.from({ length: count }, () => ({ resumeVersionId: versionId, status, createdAt: day(1) }));
}

test('wishlist entries are excluded from the denominator', () => {
  const versions = [{ id: 'v1', label: 'v1', createdAt: day(1) }];
  const applications = [
    ...apps('v1', 'wishlist', 10),
    ...apps('v1', 'applied', 5),
    ...apps('v1', 'interview', 1),
  ];
  const r = computeOutcomeReport(versions, applications);
  assert.equal(r.versions[0].applied, 6);
});

test('flags versions with < MIN_SAMPLE_SIZE as not significant', () => {
  const versions = [{ id: 'v1', label: 'v1', createdAt: day(1) }];
  const r = computeOutcomeReport(versions, apps('v1', 'applied', MIN_SAMPLE_SIZE - 1));
  assert.equal(r.versions[0].significant, false);
  assert.equal(r.top, null);
});

test('reports lift multiplier between baseline and top version', () => {
  const versions = [
    { id: 'v1', label: 'v1', createdAt: day(1) },
    { id: 'v2', label: 'v2', createdAt: day(10) },
  ];
  const applications = [
    // v1: 10 applied, 1 response → 10%
    ...apps('v1', 'applied', 9),
    ...apps('v1', 'interview', 1),
    // v2: 10 applied, 5 responses → 50% → 5× lift
    ...apps('v2', 'applied', 5),
    ...apps('v2', 'interview', 4),
    ...apps('v2', 'offer', 1),
  ];
  const r = computeOutcomeReport(versions, applications);
  assert.equal(r.top.versionId, 'v2');
  assert.equal(r.baseline.versionId, 'v1');
  assert.ok(r.lift.multiplier > 4.9 && r.lift.multiplier < 5.1);
  assert.ok(r.lift.headline.includes('v2'));
  assert.ok(r.lift.headline.includes('v1'));
});

test('rejected status counts toward responses, not interviews', () => {
  const versions = [{ id: 'v1', label: 'v1', createdAt: day(1) }];
  const applications = [
    ...apps('v1', 'applied', 4),
    ...apps('v1', 'rejected', 4),
    ...apps('v1', 'interview', 2),
  ];
  const r = computeOutcomeReport(versions, applications);
  const v1 = r.versions[0];
  assert.equal(v1.applied, 10);
  assert.equal(v1.responses, 6);   // 4 rejected + 2 interview
  assert.equal(v1.interviews, 2);  // only interview / offer
  assert.equal(v1.offers, 0);
});

test('unattributed applications are counted separately', () => {
  const versions = [{ id: 'v1', label: 'v1', createdAt: day(1) }];
  const applications = [
    ...apps('v1', 'applied', 5),
    { resumeVersionId: null, status: 'applied', createdAt: day(2) },
    { resumeVersionId: null, status: 'interview', createdAt: day(3) },
  ];
  const r = computeOutcomeReport(versions, applications);
  assert.equal(r.unattributed, 2);
  assert.equal(r.versions[0].applied, 5);
});

test('headline communicates "not enough data" when only one significant version', () => {
  const versions = [
    { id: 'v1', label: 'v1', createdAt: day(1) },
    { id: 'v2', label: 'v2', createdAt: day(10) },
  ];
  const r = computeOutcomeReport(versions, apps('v2', 'applied', 5));
  assert.ok(r.lift.headline.toLowerCase().includes('need'));
  assert.equal(r.lift.multiplier, null);
});

test('orphan version (snapshot deleted) still appears in report', () => {
  const versions = [{ id: 'v1', label: 'v1', createdAt: day(1) }];
  const applications = apps('orphan-id', 'applied', 3);
  const r = computeOutcomeReport(versions, applications);
  const orphan = r.versions.find((v) => v.versionId === 'orphan-id');
  assert.ok(orphan);
  assert.equal(orphan.label, '(deleted snapshot)');
});
