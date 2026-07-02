import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAbInsight, buildAbBars } from '@/src/lib/outcome-ab';
import type { OutcomeVersionStats } from '@/src/lib/api';

function v(partial: Partial<OutcomeVersionStats>): OutcomeVersionStats {
  return {
    versionId: 'v', label: 'V', createdAt: '2026-01-01', applied: 0,
    responses: 0, interviews: 0, offers: 0, responseRate: 0,
    interviewRate: 0, offerRate: 0, atsScore: null, significant: false,
    ...partial,
  };
}

// ── computeAbInsight ────────────────────────────────────────────────────

test('produces the "X× more replies" insight from two significant versions', () => {
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

test('returns null when every other version has a zero rate (no Infinity×)', () => {
  assert.equal(computeAbInsight([
    v({ versionId: 'a', applied: 9, responseRate: 0.4, significant: true }),
    v({ versionId: 'b', applied: 7, responseRate: 0, significant: true }),
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
