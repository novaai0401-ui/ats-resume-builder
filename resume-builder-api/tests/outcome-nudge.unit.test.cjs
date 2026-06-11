const assert = require('node:assert/strict');
const test = require('node:test');
const { __testables } = require('../dist/outcome-nudge/outcome-nudge.service.js');

/**
 * R-031 outcome-nudge contract tests.
 *
 * The full loop (scan → email → one-tap → status change) was smoke-
 * verified against the local stack; these pin the pieces that must
 * not drift in refactors:
 *   - token shape + entropy (the token IS the authorization for the
 *     unauthenticated one-tap endpoint, so its strength matters)
 *   - the action → status mapping (the Outcome Graph depends on
 *     these exact transitions)
 *   - the scan timing constants (7-day staleness, 30-day token TTL)
 *     which the founder approved in the R-031 acceptance criteria.
 */

const { randomToken, ACTION_TO_STATUS, NUDGE_AFTER_DAYS, TOKEN_TTL_DAYS } = __testables;

test('token is 32 chars from an unambiguous alphabet', () => {
  for (let i = 0; i < 100; i += 1) {
    const t = randomToken();
    assert.equal(t.length, 32);
    assert.match(t, /^[A-Za-z0-9]+$/);
    // 0/1/I/l/O excluded — these tokens land in emails and may get
    // retyped from a phone screen.
    assert.doesNotMatch(t, /[01IlO]/);
  }
});

test('token entropy: 100 draws produce 100 unique values', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(randomToken());
  assert.equal(seen.size, 100);
});

test('action → status mapping is exactly the three documented transitions', () => {
  // no_reply keeps the status (null → bump nextActionAt instead);
  // rejected + interview advance it. Nothing else may sneak in —
  // each key here is an unauthenticated state transition.
  assert.deepEqual(ACTION_TO_STATUS, {
    no_reply: null,
    rejected: 'rejected',
    interview: 'interview',
  });
});

test('scan constants match the R-031 acceptance criteria', () => {
  assert.equal(NUDGE_AFTER_DAYS, 7, 'nudge fires 7 days after applied');
  assert.equal(TOKEN_TTL_DAYS, 30, 'tokens expire in 30 days');
});
