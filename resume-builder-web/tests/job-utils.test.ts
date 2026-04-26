import assert from 'node:assert/strict';
import test from 'node:test';
import type { JobApplication } from 'resume-builder-shared';
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  KANBAN_STATUSES,
  buildStatsFromJobs,
  daysUntil,
  groupByStatus,
} from '../src/lib/job-utils';

function makeJob(id: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    userId: 'u1',
    company: 'Acme',
    role: 'Engineer',
    jdUrl: null,
    jdText: null,
    location: null,
    salaryRange: null,
    status: 'wishlist',
    source: null,
    referral: null,
    resumeId: null,
    coverLetterId: null,
    notes: null,
    nextActionAt: null,
    appliedAt: null,
    closedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

test('JOB_STATUSES matches the shared contract length and order', () => {
  assert.deepEqual(JOB_STATUSES, [
    'wishlist',
    'applied',
    'phone_screen',
    'interview',
    'offer',
    'rejected',
    'withdrawn',
  ]);
  assert.deepEqual(KANBAN_STATUSES, ACTIVE_STATUSES);
  assert.equal(ACTIVE_STATUSES.length + CLOSED_STATUSES.length, JOB_STATUSES.length);
});

test('every status has a human-readable label', () => {
  for (const status of JOB_STATUSES) {
    const label = JOB_STATUS_LABELS[status];
    assert.ok(label, `missing label for ${status}`);
    assert.ok(label.length > 0);
  }
});

test('groupByStatus buckets jobs and preserves unknown statuses as wishlist', () => {
  const jobs = [
    makeJob('1', { status: 'applied' }),
    makeJob('2', { status: 'offer' }),
    // @ts-expect-error testing runtime defensiveness
    makeJob('3', { status: 'banana' }),
    makeJob('4', { status: 'interview' }),
  ];
  const grouped = groupByStatus(jobs);
  assert.equal(grouped.applied.length, 1);
  assert.equal(grouped.offer.length, 1);
  assert.equal(grouped.interview.length, 1);
  assert.equal(grouped.wishlist.length, 1);
});

test('buildStatsFromJobs computes pipeline metrics', () => {
  const jobs = [
    makeJob('1', { status: 'applied' }),
    makeJob('2', { status: 'applied' }),
    makeJob('3', { status: 'interview' }),
    makeJob('4', { status: 'offer' }),
    makeJob('5', { status: 'rejected' }),
    makeJob('6', { status: 'withdrawn' }),
  ];
  const stats = buildStatsFromJobs(jobs);
  assert.equal(stats.total, 6);
  assert.equal(stats.byStatus.applied, 2);
  assert.equal(stats.byStatus.offer, 1);
  // active = applied(2) + interview(1) + offer(1) + wishlist(0) + phone_screen(0) = 4
  assert.equal(stats.active, 4);
  // respondingDen = 2 + 0 + 1 + 1 + 1 = 5, responding = 0 + 1 + 1 = 2
  assert.equal(stats.responseRate, 0.4);
  // offerRate = 1 / (1 + 1) = 0.5
  assert.equal(stats.offerRate, 0.5);
});

test('buildStatsFromJobs returns zero rates when denominators are empty', () => {
  const stats = buildStatsFromJobs([makeJob('1', { status: 'wishlist' })]);
  assert.equal(stats.responseRate, 0);
  assert.equal(stats.offerRate, 0);
});

test('daysUntil returns null for empty input and negative values for past dates', () => {
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil(''), null);
  assert.equal(daysUntil('not-a-date'), null);
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const delta = daysUntil(past);
  assert.ok(delta !== null && delta < 0, 'past date should produce a negative delta');
});
