const test = require('node:test');
const assert = require('node:assert/strict');
const { EmailVerificationService } = require('../dist/auth/email-verification.service.js');
const { AuthService } = require('../dist/auth/auth.service.js');

// ── EmailVerificationService mechanics ──────────────────────────────────────
// In-memory stand-ins for the two prisma tables the service touches. Each
// test uses a DIFFERENT email so the module-level rate limiter (3 codes per
// 10 min per email) never interferes across tests.

function makeHarness({ existingUser = null } = {}) {
  const state = { challenge: null, deletedFor: [], updates: [], sentTo: [], sentOtp: null };
  const prisma = {
    user: {
      findUnique: async () => existingUser,
    },
    emailOtpChallenge: {
      create: async ({ data }) => {
        state.challenge = { id: 'ch1', attempts: 0, lockedUntil: null, createdAt: new Date(), ...data };
        return state.challenge;
      },
      findFirst: async () => state.challenge,
      update: async ({ data }) => {
        state.updates.push(data);
        Object.assign(state.challenge, data);
        return state.challenge;
      },
      deleteMany: async ({ where }) => {
        state.deletedFor.push(where.email);
        state.challenge = null;
        return { count: 1 };
      },
    },
  };
  const mail = {
    sendEmailVerificationCode: async (to, otp) => {
      state.sentTo.push(to);
      state.sentOtp = otp;
      return true;
    },
  };
  return { svc: new EmailVerificationService(prisma, mail), state, mail };
}

test('start(): rejects a malformed email before touching anything', async () => {
  const { svc, state } = makeHarness();
  await assert.rejects(() => svc.start('not-an-email'), /valid email/i);
  assert.equal(state.sentTo.length, 0);
});

test('start(): refuses an email that already has an account', async () => {
  const { svc } = makeHarness({ existingUser: { id: 'u1' } });
  await assert.rejects(() => svc.start('taken@person.dev'), /already exists/i);
});

test('start() then assertVerified(): full happy path, one code one registration', async () => {
  const { svc, state } = makeHarness();
  const res = await svc.start('Fresh@Person.DEV', { ip: '1.2.3.4', userAgent: 'ua' });
  assert.deepEqual(res, { sent: true });
  // Email is normalized, the code is 6 digits, and only its HASH is stored.
  assert.deepEqual(state.sentTo, ['fresh@person.dev']);
  assert.match(state.sentOtp, /^\d{6}$/);
  assert.notEqual(state.challenge.otpHash, state.sentOtp);

  // Wrong code: counted, not accepted.
  await assert.rejects(() => svc.assertVerified('fresh@person.dev', '000000'), /not correct/i);
  assert.equal(state.challenge.attempts, 1);

  // Right code: passes and burns every challenge for the address.
  await svc.assertVerified('fresh@person.dev', state.sentOtp);
  assert.deepEqual(state.deletedFor, ['fresh@person.dev']);

  // The burnt code cannot be replayed for a second registration.
  await assert.rejects(() => svc.assertVerified('fresh@person.dev', state.sentOtp), /expired/i);
});

test('start(): a failed send is reported truthfully, never a fake "sent"', async () => {
  const { svc, mail } = makeHarness();
  mail.sendEmailVerificationCode = async () => false;
  await assert.rejects(() => svc.start('unlucky@person.dev'), /could not send/i);
});

// ── The registration gate in AuthService ────────────────────────────────────

function makeAuthService({ emailVerification, createSentinel } = {}) {
  const calls = { assertVerified: [], created: 0 };
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async () => {
        calls.created += 1;
        throw new Error(createSentinel || 'CREATE_REACHED');
      },
    },
    loginEvent: { findFirst: async () => null, create: async () => ({}) },
  };
  const jwt = { signAsync: async () => 'token' };
  const config = { get: (_k, d) => d };
  const svc = new AuthService(prisma, jwt, config, undefined, undefined, emailVerification);
  return { svc, calls };
}

test('register(): without a code, refuses with the EMAIL_VERIFICATION_REQUIRED marker', async () => {
  const { svc, calls } = makeAuthService({
    emailVerification: { assertVerified: async () => {} },
  });
  await assert.rejects(
    () => svc.register({ fullName: 'No Code', email: 'nocode@person.dev' }),
    /EMAIL_VERIFICATION_REQUIRED/,
  );
  assert.equal(calls.created, 0); // no user row was ever attempted
});

test('register(): the supplied code is checked BEFORE any user row is created', async () => {
  const seen = [];
  const { svc, calls } = makeAuthService({
    emailVerification: {
      assertVerified: async (email, otp) => {
        seen.push({ email, otp });
        throw new Error('OTP_CHECK_RAN');
      },
    },
  });
  await assert.rejects(
    () => svc.register({ fullName: 'With Code', email: 'WithCode@Person.dev', otp: '123456' }),
    /OTP_CHECK_RAN/,
  );
  assert.deepEqual(seen, [{ email: 'withcode@person.dev', otp: '123456' }]);
  assert.equal(calls.created, 0);
});

test('register(): REQUIRE_EMAIL_VERIFICATION=false skips the gate (SMTP-outage escape hatch)', async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  try {
    const { svc, calls } = makeAuthService({
      emailVerification: {
        assertVerified: async () => {
          throw new Error('GATE_SHOULD_BE_OFF');
        },
      },
      createSentinel: 'CREATE_REACHED',
    });
    // Reaching user.create without a code proves the gate stood down.
    await assert.rejects(
      () => svc.register({ fullName: 'Gate Off', email: 'gateoff@person.dev' }),
      /CREATE_REACHED/,
    );
    assert.equal(calls.created, 1);
  } finally {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  }
});
