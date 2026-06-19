'use strict';

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const bcrypt = require('bcryptjs');

const { PasswordResetService } = require('../dist/auth/password-reset.service.js');

function makePrismaMock() {
  const challenges = [];
  const users = new Map();
  return {
    challenges,
    users,
    user: {
      async findUnique({ where }) {
        return users.get(where.email) || null;
      },
      async update({ where, data }) {
        const existing = Array.from(users.values()).find((u) => u.id === where.id);
        if (!existing) return null;
        Object.assign(existing, data);
        return existing;
      },
    },
    passwordResetChallenge: {
      async findFirst({ where, orderBy }) {
        const filtered = challenges.filter((c) => c.email === where.email);
        if (orderBy?.createdAt === 'desc') {
          filtered.sort((a, b) => b.createdAt - a.createdAt);
        }
        return filtered[0] || null;
      },
      async deleteMany({ where }) {
        for (let i = challenges.length - 1; i >= 0; i--) {
          if (challenges[i].email === where.email) challenges.splice(i, 1);
        }
        return { count: 0 };
      },
      async create({ data }) {
        const row = {
          id: `c-${challenges.length + 1}`,
          attempts: 0,
          lockedUntil: null,
          ip: null,
          userAgent: null,
          createdAt: new Date(),
          ...data,
        };
        challenges.push(row);
        return row;
      },
      async update({ where, data }) {
        const existing = challenges.find((c) => c.id === where.id);
        if (existing) Object.assign(existing, data);
        return existing;
      },
    },
  };
}

function makeMailMock(opts = {}) {
  return {
    isConfigured: opts.configured !== false,
    sentTo: [],
    sentOtps: [],
    async sendPasswordResetEmail(to, otp) {
      this.sentTo.push(to);
      this.sentOtps.push(otp);
      return opts.failSend ? false : true;
    },
  };
}

function makeAuthMock() {
  return {
    resetCalls: [],
    async resetPassword(email, newPassword) {
      this.resetCalls.push({ email, newPassword });
      return { ok: true, message: 'reset' };
    },
  };
}

describe('PasswordResetService.requestReset', () => {
  beforeEach(() => {
    // Reset module-scoped rate limiter maps by reloading the module.
    delete require.cache[require.resolve('../dist/auth/password-reset.service.js')];
  });

  it('returns the enumeration-safe response when the email is unknown', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    const mail = makeMailMock();
    const auth = makeAuthMock();
    const svc = new PasswordResetService(prisma, mail, auth);
    const res = await svc.requestReset('ghost@example.com');
    assert.equal(res.ok, true);
    assert.match(res.message, /If an account exists/);
    assert.equal(mail.sentTo.length, 0, 'no email should be sent for unknown user');
  });

  it('returns the enumeration-safe response for malformed emails', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    const mail = makeMailMock();
    const svc = new PasswordResetService(prisma, mail, makeAuthMock());
    const res = await svc.requestReset('not-an-email');
    assert.equal(res.ok, true);
    assert.equal(mail.sentTo.length, 0);
  });

  it('does not send email for social-only accounts but responds uniformly', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.users.set('social@example.com', {
      id: 'u1',
      email: 'social@example.com',
      hasUserSetPassword: false,
    });
    const mail = makeMailMock();
    const svc = new PasswordResetService(prisma, mail, makeAuthMock());
    const res = await svc.requestReset('social@example.com');
    assert.equal(res.ok, true);
    assert.equal(mail.sentTo.length, 0);
  });

  it('issues a 6-digit OTP and stores a hashed challenge for valid users', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.users.set('user@example.com', {
      id: 'u1',
      email: 'user@example.com',
      hasUserSetPassword: true,
    });
    const mail = makeMailMock();
    const svc = new PasswordResetService(prisma, mail, makeAuthMock());
    await svc.requestReset('user@example.com');
    assert.equal(mail.sentTo.length, 1);
    assert.equal(mail.sentTo[0], 'user@example.com');
    assert.match(mail.sentOtps[0], /^\d{6}$/);
    assert.equal(prisma.challenges.length, 1);
    assert.notEqual(prisma.challenges[0].otpHash, mail.sentOtps[0], 'stored hash must not equal raw OTP');
  });

  it('throws on cooldown when a challenge was just created', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.users.set('user@example.com', {
      id: 'u1',
      email: 'user@example.com',
      hasUserSetPassword: true,
    });
    prisma.challenges.push({
      id: 'c0',
      email: 'user@example.com',
      otpHash: 'x',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });
    const mail = makeMailMock();
    const svc = new PasswordResetService(prisma, mail, makeAuthMock());
    await assert.rejects(() => svc.requestReset('user@example.com'), /60 seconds|reset code was just sent/i);
  });
});

describe('PasswordResetService.confirmReset', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../dist/auth/password-reset.service.js')];
  });

  it('validates the OTP shape and password length', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const svc = new PasswordResetService(makePrismaMock(), makeMailMock(), makeAuthMock());
    await assert.rejects(() => svc.confirmReset('bad-email', '123456', 'longenough123'), /Invalid email/);
    await assert.rejects(() => svc.confirmReset('a@b.com', 'abc', 'longenough123'), /Invalid reset code/);
    await assert.rejects(() => svc.confirmReset('a@b.com', '123456', 'short'), /at least 10/);
  });

  it('rejects when no challenge exists', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    const svc = new PasswordResetService(prisma, makeMailMock(), makeAuthMock());
    await assert.rejects(
      () => svc.confirmReset('user@example.com', '123456', 'longenough123'),
      /No active reset request/,
    );
  });

  it('rejects expired challenges', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.challenges.push({
      id: 'c1',
      email: 'user@example.com',
      otpHash: await bcrypt.hash('123456', 4),
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      lockedUntil: null,
      createdAt: new Date(Date.now() - 60_000),
    });
    const svc = new PasswordResetService(prisma, makeMailMock(), makeAuthMock());
    await assert.rejects(
      () => svc.confirmReset('user@example.com', '123456', 'longenough123'),
      /expired/,
    );
  });

  it('locks the challenge after 5 invalid attempts', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.challenges.push({
      id: 'c1',
      email: 'user@example.com',
      otpHash: await bcrypt.hash('123456', 4),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 4,
      lockedUntil: null,
      createdAt: new Date(),
    });
    const svc = new PasswordResetService(prisma, makeMailMock(), makeAuthMock());
    await assert.rejects(
      () => svc.confirmReset('user@example.com', '999999', 'longenough123'),
      /Invalid reset code/,
    );
    assert.ok(prisma.challenges[0].lockedUntil instanceof Date);
  });

  it('successfully resets password and burns the challenge on valid OTP', async () => {
    const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
    const prisma = makePrismaMock();
    prisma.challenges.push({
      id: 'c1',
      email: 'user@example.com',
      otpHash: await bcrypt.hash('123456', 4),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
    });
    const auth = makeAuthMock();
    const svc = new PasswordResetService(prisma, makeMailMock(), auth);
    const res = await svc.confirmReset('user@example.com', '123456', 'longenough123');
    assert.equal(res.ok, true);
    assert.equal(auth.resetCalls.length, 1);
    assert.equal(auth.resetCalls[0].email, 'user@example.com');
    assert.equal(auth.resetCalls[0].newPassword, 'longenough123');
    assert.equal(prisma.challenges.length, 0, 'challenge should be deleted');
  });
});
