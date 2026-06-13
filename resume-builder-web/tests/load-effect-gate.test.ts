import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSkipServerHydration } from '../src/lib/load-effect-gate';

// Regression guard for the "ATS score appears, vanishes, re-appears"
// flicker reported in the post-upload video. The load effect must
// skip the redundant api.getResume call when the local state is
// already the canonical version of that id.

test('skips the hydration fetch when local copy matches the requested id', () => {
  // Exactly the post-autosave case: autosave just persisted resume
  // 'r_abc123' and locally-settled the ref. Now effectiveResumeId
  // flips '' → 'r_abc123' because session storage just got the id.
  // The load effect must no-op.
  assert.equal(shouldSkipServerHydration('r_abc123', 'r_abc123'), true);
});

test('runs the hydration fetch when no local copy has been settled yet', () => {
  // Cold open: dashboard → click a saved resume → editor mounts.
  // Local ref is still '' because nothing was ever set. We MUST fetch.
  assert.equal(shouldSkipServerHydration('r_abc123', ''), false);
});

test('runs the hydration fetch when the requested id changed', () => {
  // User opens resume A, then navigates to resume B in the same
  // session. effectiveResumeId is now r_B but the ref still holds
  // r_A — must fetch the new one.
  assert.equal(shouldSkipServerHydration('r_B', 'r_A'), false);
});

test('treats empty / whitespace inputs as "no skip"', () => {
  assert.equal(shouldSkipServerHydration('', ''), false);
  assert.equal(shouldSkipServerHydration('   ', '   '), false);
  assert.equal(shouldSkipServerHydration('r_abc123', '   '), false);
  assert.equal(shouldSkipServerHydration('   ', 'r_abc123'), false);
});

test('tolerates surrounding whitespace on either input', () => {
  // The persisted id occasionally comes back with stray whitespace
  // when round-tripped through session storage on some browsers.
  // Trim both sides before comparing.
  assert.equal(shouldSkipServerHydration('  r_abc123  ', 'r_abc123'), true);
  assert.equal(shouldSkipServerHydration('r_abc123', '  r_abc123\n'), true);
});

test('never matches different non-empty ids that happen to overlap as substrings', () => {
  // Belt-and-braces: the comparison is exact equality, not substring.
  assert.equal(shouldSkipServerHydration('r_abc', 'r_abc123'), false);
  assert.equal(shouldSkipServerHydration('r_abc123', 'r_abc'), false);
});
