import assert from 'node:assert/strict';
import test from 'node:test';
import { activeHubKey, NAV_HUBS } from '../src/lib/nav-hubs';

/**
 * R-036 nav-hub active-state rules:
 *   - Home only matches the exact path '/' (never as a prefix).
 *   - Every other hub matches the longest prefix in its `routesUnder`
 *     list — so /resume/versions lights up Resume, /jd-match lights
 *     up Applications, /settings lights up Account.
 *   - The Plan badge + Admin + Logout + Auth links live OUTSIDE the
 *     hub set; their routes return null so they never accidentally
 *     activate a hub.
 *
 * These tests pin the prefix map AND the structural promises (5 hubs,
 * landings that are real working routes, every routesUnder entry
 * actually reachable in production) so a future "just remove this
 * link" patch can't quietly drift.
 */

test('exactly five hubs, in launch-order', () => {
  assert.deepEqual(
    NAV_HUBS.map((h) => h.key),
    ['home', 'resume', 'applications', 'coach', 'account'],
  );
});

test('every hub landing is a real route already used in the app', () => {
  // Real routes that exist in the repo today. Any landing that
  // doesn't appear here is either a typo or an /app/<route>/page.tsx
  // that nobody added — both regressions.
  const realRoutes = new Set([
    '/', '/resume/start', '/applications', '/coach', '/settings',
  ]);
  for (const hub of NAV_HUBS) {
    assert.ok(realRoutes.has(hub.landing), `unknown landing for ${hub.key}: ${hub.landing}`);
  }
});

test('Home only matches the exact root path', () => {
  assert.equal(activeHubKey('/'), 'home');
  assert.equal(activeHubKey('/dashboard'), null);
  assert.equal(activeHubKey('/resume/start'), 'resume');
});

test('Resume hub claims editor + sub-routes', () => {
  for (const path of [
    '/resume',
    '/resume/start',
    '/resume/review',
    '/resume/template',
    '/resume/versions',
    '/resume/ats',
    '/resume/ats-simulate',
    '/templates',
    '/templates/preview',
  ]) {
    assert.equal(activeHubKey(path), 'resume', `expected Resume for ${path}`);
  }
});

test('Applications hub claims jobs / jd-match / outcomes / cover-letter', () => {
  assert.equal(activeHubKey('/applications'), 'applications');
  assert.equal(activeHubKey('/jobs'), 'applications');
  assert.equal(activeHubKey('/jd-match'), 'applications');
  assert.equal(activeHubKey('/resume/outcomes'), 'applications');
  assert.equal(activeHubKey('/cover-letter'), 'applications');
});

test('Coach hub claims mentor / interview-prep / career / sahaayak', () => {
  assert.equal(activeHubKey('/coach'), 'coach');
  assert.equal(activeHubKey('/mentor'), 'coach');
  assert.equal(activeHubKey('/mentor/chat'), 'coach');
  assert.equal(activeHubKey('/interview-prep'), 'coach');
  assert.equal(activeHubKey('/career'), 'coach');
  assert.equal(activeHubKey('/sahaayak'), 'coach');
});

test('Account hub claims settings + billing', () => {
  assert.equal(activeHubKey('/settings'), 'account');
  assert.equal(activeHubKey('/billing'), 'account');
});

test('Outcomes lights up the SAME hub as the Jobs tracker, not Resume', () => {
  // The whole point of the 5-hub IA — measurement of applications
  // belongs with the tracker, not buried under Resume. If a future
  // edit silently moves /resume/outcomes back under Resume this fails.
  assert.equal(activeHubKey('/resume/outcomes'), 'applications');
  assert.notEqual(activeHubKey('/resume/outcomes'), 'resume');
});

test('utility routes (auth / admin / download) do NOT activate a hub', () => {
  // These are peripheral surfaces — their nav entries exist outside
  // the hub set and must not steal a hub's highlight.
  for (const path of [
    '/auth/login', '/auth/register', '/auth/forgot-password',
    '/admin', '/admin/settings', '/admin/pattern-review',
    '/download',
  ]) {
    assert.equal(activeHubKey(path), null, `${path} unexpectedly activated a hub`);
  }
});

test('empty pathname (pre-hydration SSR) never activates a hub', () => {
  assert.equal(activeHubKey(''), null);
});

test('partial-string-similar paths do NOT collide (boundary check)', () => {
  // /resume-template must not light up Resume; /jobs-archive must not
  // light up Applications. Without the explicit '/' separator in the
  // prefix check, both would falsely match.
  assert.equal(activeHubKey('/resume-template'), null);
  assert.equal(activeHubKey('/jobs-archive'), null);
});

test('longest-prefix wins when two hubs share an overlapping family', () => {
  // /resume/outcomes is under BOTH '/resume' (Resume hub via routesUnder)
  // and '/resume/outcomes' (Applications hub). The longer entry must win
  // — that is what puts Outcomes with the tracker. If a future edit adds
  // '/resume' to Resume.routesUnder without paying attention to this
  // rule, Outcomes will flip back to Resume and this test will fail.
  const hits: string[] = [];
  for (const hub of NAV_HUBS) {
    if (hub.routesUnder.some((r) => '/resume/outcomes' === r || '/resume/outcomes'.startsWith(r + '/'))) {
      hits.push(hub.key);
    }
  }
  assert.ok(hits.includes('resume'));
  assert.ok(hits.includes('applications'));
  assert.equal(activeHubKey('/resume/outcomes'), 'applications', 'longest prefix must win');
});
