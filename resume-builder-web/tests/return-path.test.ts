import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReturnPath } from '../src/lib/return-path';

/**
 * R-107 regression. AuthGate stored `pathname` only, so a signed-out user
 * arriving from an assistant at /resume?resumeId=abc was returned to a
 * bare /resume after signing in — the resume they were sent to open was
 * gone, and the handoff dead-ended right after earning the signup.
 */

test('the query string survives the sign-in round trip', () => {
  assert.equal(buildReturnPath('/resume', 'resumeId=abc123'), '/resume?resumeId=abc123');
  assert.equal(buildReturnPath('/resume', '?resumeId=abc123'), '/resume?resumeId=abc123');
});

test('every parameter is kept, not just the first', () => {
  assert.equal(
    buildReturnPath('/resume', 'resumeId=abc&utm_source=ai-assistant'),
    '/resume?resumeId=abc&utm_source=ai-assistant',
  );
});

test('a path with no query is unchanged', () => {
  assert.equal(buildReturnPath('/dashboard', ''), '/dashboard');
  assert.equal(buildReturnPath('/dashboard', null), '/dashboard');
  assert.equal(buildReturnPath('/dashboard'), '/dashboard');
});

test('a missing pathname falls back to the dashboard', () => {
  assert.equal(buildReturnPath(null, ''), '/dashboard');
  assert.equal(buildReturnPath(undefined, 'resumeId=abc'), '/dashboard?resumeId=abc');
});
