'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  JobsService,
  median,
  responseRateFromStatuses,
  BENCHMARK_MIN_APPLICATIONS,
  BENCHMARK_MIN_COHORT_USERS,
} = require('../dist/jobs/jobs.service.js');

// Fake prisma exposing only what benchmark() reads: findMany with a
// { userId, status } select over qualifying statuses.
function makePrisma(rows) {
  return {
    jobApplication: {
      async findMany({ where }) {
        const allowed = where?.status?.in;
        return rows
          .filter((r) => !allowed || allowed.includes(r.status))
          .map((r) => ({ userId: r.userId, status: r.status }));
      },
    },
  };
}

function appsFor(userId, statuses) {
  return statuses.map((status) => ({ userId, status }));
}

// n users, each with 5 applied apps and `responded` of them phone_screen.
function cohort(n, responded = 1) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const statuses = Array.from({ length: 5 }, (_, j) =>
      j < responded ? 'phone_screen' : 'applied',
    );
    rows.push(...appsFor(`cohort-${i}`, statuses));
  }
  return rows;
}

describe('median', () => {
  it('returns null for an empty list', () => {
    assert.equal(median([]), null);
  });

  it('returns the middle value for an odd-length list', () => {
    assert.equal(median([30, 10, 20]), 20);
  });

  it('averages the two middle values for an even-length list', () => {
    assert.equal(median([40, 10, 20, 30]), 25);
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    assert.deepEqual(input, [3, 1, 2]);
  });
});

describe('responseRateFromStatuses', () => {
  it('counts phone_screen/interview/offer as responses over applied+ statuses', () => {
    const out = responseRateFromStatuses([
      'applied',
      'phone_screen',
      'interview',
      'offer',
      'rejected',
    ]);
    assert.deepEqual(out, { applications: 5, responses: 3, responseRatePct: 60 });
  });

  it('excludes wishlist and withdrawn entirely', () => {
    const out = responseRateFromStatuses(['wishlist', 'withdrawn', 'applied', 'offer']);
    assert.deepEqual(out, { applications: 2, responses: 1, responseRatePct: 50 });
  });

  it('returns zeros for no qualifying applications', () => {
    assert.deepEqual(responseRateFromStatuses(['wishlist']), {
      applications: 0,
      responses: 0,
      responseRatePct: 0,
    });
  });

  it('rounds the pct to one decimal', () => {
    const out = responseRateFromStatuses(['phone_screen', 'applied', 'applied']);
    assert.equal(out.responseRatePct, 33.3);
  });
});

describe('JobsService.benchmark gating', () => {
  it('locks when below both thresholds', async () => {
    const svc = new JobsService(makePrisma(appsFor('me', ['applied', 'applied'])));
    const out = await svc.benchmark('me');
    assert.equal(out.available, false);
    assert.match(out.reason, /at least 5 applications/i);
    assert.deepEqual(out.yours, { applications: 2, responses: 0, responseRatePct: 0 });
    assert.equal(out.platform, undefined);
  });

  it('locks when the caller qualifies but the cohort is too small', async () => {
    const rows = [
      ...appsFor('me', ['applied', 'applied', 'applied', 'applied', 'phone_screen']),
      ...cohort(BENCHMARK_MIN_COHORT_USERS - 2), // + me = 9 qualifying users
    ];
    const svc = new JobsService(makePrisma(rows));
    const out = await svc.benchmark('me');
    assert.equal(out.available, false);
    assert.match(out.reason, /10\+ users/);
    assert.equal(out.platform, undefined);
  });

  it('locks when the cohort qualifies but the caller does not', async () => {
    const rows = [...appsFor('me', ['applied']), ...cohort(BENCHMARK_MIN_COHORT_USERS)];
    const svc = new JobsService(makePrisma(rows));
    const out = await svc.benchmark('me');
    assert.equal(out.available, false);
    assert.match(out.reason, /at least 5 applications/i);
  });

  it('unlocks with the median and cohort size when both thresholds are met', async () => {
    const rows = [
      // me: 5 apps, 3 responses -> 60%
      ...appsFor('me', ['phone_screen', 'interview', 'offer', 'applied', 'rejected']),
      // 10 other users at 20% each -> median 20
      ...cohort(BENCHMARK_MIN_COHORT_USERS),
    ];
    const svc = new JobsService(makePrisma(rows));
    const out = await svc.benchmark('me');
    assert.equal(out.available, true);
    assert.equal(out.reason, undefined);
    assert.deepEqual(out.yours, { applications: 5, responses: 3, responseRatePct: 60 });
    assert.deepEqual(out.platform, {
      medianResponseRatePct: 20,
      cohortUsers: BENCHMARK_MIN_COHORT_USERS + 1, // includes the caller
    });
  });

  it('never exposes per-user data of others', async () => {
    const svc = new JobsService(makePrisma(cohort(BENCHMARK_MIN_COHORT_USERS + 5)));
    const out = await svc.benchmark('cohort-0');
    const json = JSON.stringify(out);
    assert.ok(!json.includes('cohort-1'), 'response must not contain other user ids');
    assert.deepEqual(Object.keys(out.platform).sort(), ['cohortUsers', 'medianResponseRatePct']);
  });

  it('exports the agreed thresholds', () => {
    assert.equal(BENCHMARK_MIN_APPLICATIONS, 5);
    assert.equal(BENCHMARK_MIN_COHORT_USERS, 10);
  });
});
