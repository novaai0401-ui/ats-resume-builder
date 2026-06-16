const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('password policy constants are consistent (10 chars, single source of truth)', async () => {
  const { MIN_PASSWORD_LENGTH, PASSWORD_MIN_HINT, PASSWORD_TOO_SHORT_MESSAGE } = await sharedPromise;
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.equal(PASSWORD_MIN_HINT, 'Min 10 characters');
  assert.match(PASSWORD_TOO_SHORT_MESSAGE, /at least 10 characters/);
});

test('isValidEmail accepts real addresses across TLDs', async () => {
  const { isValidEmail } = await sharedPromise;
  for (const ok of ['you@example.com', 'soumyg76@gmail.com', 'a.b@sub.co.in', 'name@host.health']) {
    assert.equal(isValidEmail(ok), true, ok);
  }
});

test('isValidEmail rejects malformed / domain-less inputs (the founder bug)', async () => {
  const { isValidEmail } = await sharedPromise;
  for (const bad of ['soumyg76.health', 'no-at-sign', 'name@host', 'name@host.', 'a@b.c', '@x.com', 'name@.com', '']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});
