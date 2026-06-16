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

test('isValidPhone accepts E.164 / local 10-digit, rejects garbage', async () => {
  const { isValidPhone } = await sharedPromise;
  for (const ok of ['+919140267207', '+14155552671', '9876543210', '09876543210', '+91 98765 43210', '(415) 555-2671']) {
    assert.equal(isValidPhone(ok), true, ok);
  }
  // "173537282727" (12 digits, no country-code +) is the founder's bad input.
  for (const bad of ['173537282727', '12345', '99999999999', 'abcdefghij', '', '+12']) {
    assert.equal(isValidPhone(bad), false, bad);
  }
});

test('ContactSchema rejects the invalid phone but accepts a clean one', async () => {
  const { CreateResumeSchema } = await sharedPromise;
  const base = {
    title: 'My Resume',
    summary: 'A sufficiently long professional summary for the schema to accept it here.',
    skills: ['ts'],
    experience: [],
    education: [],
  };
  const bad = CreateResumeSchema.safeParse({ ...base, contact: { fullName: 'A B', phone: '173537282727' } });
  assert.equal(bad.success, false, 'garbage phone must be rejected by the schema');

  const good = CreateResumeSchema.safeParse({ ...base, contact: { fullName: 'A B', phone: '+919140267207', email: 'a@b.com' } });
  assert.equal(good.success, true, 'valid contact must pass');
});
