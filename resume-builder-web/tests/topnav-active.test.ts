import assert from 'node:assert/strict';
import test from 'node:test';
import { isNavActive, RESUME_SUBROUTE_OWNED } from '../src/lib/nav-active';

// Nav highlight rules:
//  - Home only matches '/' exactly (never as prefix).
//  - Other links match exact path OR sub-route prefix.
//  - excludePrefixes lets a parent route opt out of claiming a
//    sub-route that has its own dedicated nav entry.

test('Home matches only the exact root path', () => {
  assert.equal(isNavActive('/', '/'), true);
  assert.equal(isNavActive('/dashboard', '/'), false);
  assert.equal(isNavActive('/resume/start', '/'), false);
});

test('an exact path match lights up the link', () => {
  assert.equal(isNavActive('/dashboard', '/dashboard'), true);
  assert.equal(isNavActive('/jobs', '/jobs'), true);
});

test('a sub-route lights up its parent by default', () => {
  // /resume/start is under /resume — Resume nav should light up
  // for the canonical Resume sub-routes.
  assert.equal(isNavActive('/resume/start', '/resume'), true);
  assert.equal(isNavActive('/resume/template', '/resume'), true);
  assert.equal(isNavActive('/resume/review', '/resume'), true);
});

test('excludePrefixes prevents Resume from claiming Versions / Outcomes / ATS Simulator', () => {
  // The exact bug the user reported: both "Resume" and "Versions"
  // were highlighted at once when on /resume/versions.
  assert.equal(
    isNavActive('/resume/versions', '/resume', RESUME_SUBROUTE_OWNED),
    false,
    'Resume must NOT light up on /resume/versions',
  );
  assert.equal(
    isNavActive('/resume/outcomes', '/resume', RESUME_SUBROUTE_OWNED),
    false,
    'Resume must NOT light up on /resume/outcomes',
  );
  assert.equal(
    isNavActive('/resume/ats-simulate', '/resume', RESUME_SUBROUTE_OWNED),
    false,
    'Resume must NOT light up on /resume/ats-simulate',
  );
});

test('Versions / Outcomes / ATS Simulator nav entries still light up for their own paths', () => {
  assert.equal(isNavActive('/resume/versions', '/resume/versions'), true);
  assert.equal(isNavActive('/resume/outcomes', '/resume/outcomes'), true);
  assert.equal(isNavActive('/resume/ats-simulate', '/resume/ats-simulate'), true);
});

test('Resume still lights up on canonical Resume sub-routes even with excludePrefixes', () => {
  // Excluding Versions/Outcomes must NOT also stop /resume/start from
  // lighting up Resume — that would leave the page un-attributed.
  assert.equal(
    isNavActive('/resume/start', '/resume', RESUME_SUBROUTE_OWNED),
    true,
  );
  assert.equal(
    isNavActive('/resume/template', '/resume', RESUME_SUBROUTE_OWNED),
    true,
  );
});

test('empty pathname (pre-hydration SSR) never matches anything', () => {
  assert.equal(isNavActive('', '/'), false);
  assert.equal(isNavActive('', '/dashboard'), false);
  assert.equal(isNavActive('', '/resume'), false);
});

test('partial-string-similar paths do NOT collide (boundary check)', () => {
  // /dashboard-admin must not light up /dashboard. Without the explicit
  // '/' separator in the prefix check this would falsely match.
  assert.equal(isNavActive('/dashboard-admin', '/dashboard'), false);
  // /resume-template must not light up /resume.
  assert.equal(isNavActive('/resume-template', '/resume'), false);
});
