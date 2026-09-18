import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAbInsight, buildAbBars } from '@/src/lib/outcome-ab';
import type { OutcomeVersionStats } from '@/src/lib/api';

/**
 * R-109 — these fixtures used to set only `responseRate`, which counts
 * rejections. The comparison now ranks on `positiveCallbackRate`, so a
 * fixture that sets a reply rate without saying how many of those replies
 * were rejections is under-specified. `callbacks` sets both: the rate
 * given IS the callback rate unless a test deliberately splits them.
 */
function v(partial: Partial<OutcomeVersionStats> & { callbacks?: number }): OutcomeVersionStats {
  const rate = partial.callbacks ?? partial.positiveCallbackRate ?? partial.responseRate ?? 0;
  return {
    versionId: 'v', label: 'V', createdAt: '2026-01-01', applied: 0,
    responses: 0, rejections: 0, positiveCallbacks: 0, interviews: 0, offers: 0,
    responseRate: rate, positiveCallbackRate: rate,
    interviewRate: 0, offerRate: 0, firstAppliedAt: null, lastAppliedAt: null,
    atsScore: null, significant: false,
    ...partial,
  };
}

// ── computeAbInsight ────────────────────────────────────────────────────

test('produces the "X× more callbacks" insight from two significant versions', () => {
  const out = computeAbInsight([
    v({ versionId: 'a', label: 'v1 senior pitch', applied: 10, responseRate: 0.48, significant: true }),
    v({ versionId: 'b', label: 'v2 keywords', applied: 8, responseRate: 0.2, significant: true }),
  ]);
  assert.ok(out);
  assert.equal(out.best.versionId, 'a');
  assert.equal(out.baseline.versionId, 'b');
  assert.equal(out.multiplier, 2.4);
  assert.equal(out.aboutTheSame, false);
});

test('returns null with fewer than two significant versions (no bucket-of-one claims)', () => {
  assert.equal(computeAbInsight([
    v({ applied: 12, responseRate: 0.5, significant: true }),
    v({ applied: 2, responseRate: 0.1, significant: false }),
  ]), null);
  assert.equal(computeAbInsight([]), null);
});

test('a zero-callback baseline yields counts, not a fabricated multiplier', () => {
  // SUPERSEDED BEHAVIOUR (R-109): this used to return null so the UI
  // could avoid printing "Infinity×". But suppressing the comparison hid
  // the clearest signal the product has — one version getting callbacks
  // while another gets none. The comparison is now returned with a null
  // multiplier, and the UI renders "3 vs 0 callbacks".
  const out = computeAbInsight([
    v({ versionId: 'a', applied: 9, positiveCallbacks: 4, callbacks: 0.4, significant: true }),
    v({ versionId: 'b', applied: 7, positiveCallbacks: 0, callbacks: 0, significant: true }),
  ]);
  assert.ok(out, 'the comparison is shown');
  assert.equal(out.best.versionId, 'a');
  assert.equal(out.multiplier, null, 'no ratio is invented against a zero baseline');
  assert.equal(out.aboutTheSame, false);
});

test('still returns null when the best version itself has no callbacks', () => {
  // Nothing to say: nobody called anybody back.
  assert.equal(computeAbInsight([
    v({ versionId: 'a', applied: 9, callbacks: 0, significant: true }),
    v({ versionId: 'b', applied: 7, callbacks: 0, significant: true }),
  ]), null);
});

test('near-equal rates are flagged aboutTheSame instead of a fake edge', () => {
  const out = computeAbInsight([
    v({ versionId: 'a', applied: 9, responseRate: 0.42, significant: true }),
    v({ versionId: 'b', applied: 9, responseRate: 0.40, significant: true }),
  ]);
  assert.ok(out);
  assert.equal(out.aboutTheSame, true);
});

// ── buildAbBars ─────────────────────────────────────────────────────────

test('bars sort by rate, scale to the best, and keep a visible minimum width', () => {
  const bars = buildAbBars([
    v({ versionId: 'a', label: 'A', applied: 10, responseRate: 0.5, significant: true }),
    v({ versionId: 'b', label: 'B', applied: 6, responseRate: 0.25, significant: true }),
    v({ versionId: 'c', label: 'C', applied: 3, responseRate: 0, significant: false }),
  ]);
  assert.equal(bars.length, 3);
  assert.deepEqual(bars.map((b) => b.versionId), ['a', 'b', 'c']);
  assert.equal(bars[0].widthPct, 100);
  assert.equal(bars[1].widthPct, 50);
  assert.equal(bars[2].widthPct, 4, 'zero-rate bar keeps a visible sliver');
});

test('versions with zero applications are excluded from the comparison', () => {
  const bars = buildAbBars([
    v({ versionId: 'a', applied: 0, responseRate: 0 }),
    v({ versionId: 'b', applied: 5, responseRate: 0.2, significant: true }),
  ]);
  assert.deepEqual(bars.map((b) => b.versionId), ['b']);
});

test('R-109: an all-rejected version never wins the comparison', () => {
  // The defect this requirement exists for. Ranking on replies made a
  // version whose every reply was a rejection look like the winner.
  const out = computeAbInsight([
    v({
      versionId: 'rejected', label: 'Rejected everywhere', applied: 10, significant: true,
      responses: 8, rejections: 8, positiveCallbacks: 0, responseRate: 0.8, positiveCallbackRate: 0,
    }),
    v({
      versionId: 'working', label: 'Quietly working', applied: 10, significant: true,
      responses: 3, rejections: 0, positiveCallbacks: 3, responseRate: 0.3, positiveCallbackRate: 0.3,
    }),
  ]);
  assert.ok(out);
  assert.equal(out.best.versionId, 'working', 'callbacks decide, not raw replies');
});

test('R-109: bars are scaled and sorted by callbacks, with replies kept as context', () => {
  const rows = buildAbBars([
    v({ versionId: 'a', applied: 10, responses: 9, rejections: 9, responseRate: 0.9, positiveCallbackRate: 0 }),
    v({ versionId: 'b', applied: 10, responses: 4, rejections: 0, responseRate: 0.4, positiveCallbackRate: 0.4 }),
  ]);
  assert.equal(rows[0].versionId, 'b', 'the version with callbacks leads');
  assert.equal(rows[0].widthPct, 100);
  assert.equal(rows[0].callbackRate, 0.4);
  assert.equal(rows[1].responseRate, 0.9, 'the reply rate is still reported, just not ranked on');
});
