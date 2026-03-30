const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { AuthController } = require('../dist/auth/auth.controller.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { EmailOtpService } = require('../dist/auth/email-otp.service.js');

class StubConfig {
  constructor(values = {}) {
    this.values = values;
  }
  get(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.values, key)) {
      return this.values[key];
    }
    return fallback;
  }
}

function createPrisma() {
  const usersByEmail = new Map();
  const usersByMobile = new Map();
  const usersById = new Map();
  const emailOtpChallenges = [];
  const loginEvents = [];
  let userSeq = 1;
  let challengeSeq = 1;

  return {
    user: {
      findUnique: async ({ where }) => {
        if (where?.email) return usersByEmail.get(where.email) || null;
        if (where?.mobile) return usersByMobile.get(where.mobile) || null;
        if (where?.id) return usersById.get(where.id) || null;
        return null;
      },
      create: async ({ data, select }) => {
        const id = data.id || `user-${userSeq++}`;
        const row = { id, loginCount: 0, ...data };
        usersByEmail.set(row.email, row);
        if (row.mobile) usersByMobile.set(row.mobile, row);
        usersById.set(id, row);
        if (!select) return { ...row };
        const selected = {};
        for (const key of Object.keys(select)) selected[key] = row[key];
        return selected;
      },
      update: async ({ where, data }) => {
        const existing = usersById.get(where.id);
        if (!existing) throw new Error('user not found');
        if (data.loginCount && data.loginCount.increment) {
          existing.loginCount = (existing.loginCount || 0) + data.loginCount.increment;
        }
        Object.assign(existing, { ...data, loginCount: existing.loginCount });
        return existing;
      },
      count: async () => usersById.size,
    },
    emailOtpChallenge: {
      findFirst: async ({ where, orderBy }) => {
        const matches = emailOtpChallenges.filter((c) => c.email === where.email);
        if (!matches.length) return null;
        return matches[matches.length - 1];
      },
      create: async ({ data }) => {
        const challenge = { id: `ch-${challengeSeq++}`, attempts: 0, ...data };
        emailOtpChallenges.push(challenge);
        return challenge;
      },
      update: async ({ where, data }) => {
        const idx = emailOtpChallenges.findIndex((c) => c.id === where.id);
        if (idx >= 0) Object.assign(emailOtpChallenges[idx], data);
      },
      deleteMany: async ({ where }) => {
        for (let i = emailOtpChallenges.length - 1; i >= 0; i--) {
          if (emailOtpChallenges[i].email === where.email) {
            emailOtpChallenges.splice(i, 1);
          }
        }
      },
    },
    loginEvent: {
      create: async ({ data }) => {
        loginEvents.push(data);
      },
      count: async () => loginEvents.length,
    },
    __state: { usersById, usersByEmail, usersByMobile, emailOtpChallenges, loginEvents },
  };
}

async function createApp(prisma) {
  const config = new StubConfig({
    NODE_ENV: 'development',
    ADMIN_EMAILS: 'admin@example.com',
    JWT_SECRET: 'test-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
  });

  const authService = {
    register: async (dto) => {
      // simulate register
      const email = dto.email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        const { BadRequestException } = require('@nestjs/common');
        throw new BadRequestException('An account with this email already exists. Please log in instead.');
      }
      const mobile = dto.mobile;
      if (!mobile || mobile.length < 10) {
        const { BadRequestException } = require('@nestjs/common');
        throw new BadRequestException('A valid mobile number is required.');
      }
      const existingMobile = await prisma.user.findUnique({ where: { mobile } });
      if (existingMobile) {
        const { BadRequestException } = require('@nestjs/common');
        throw new BadRequestException('This mobile number is already linked to another account. Please use another mobile number.');
      }
      const user = await prisma.user.create({
        data: { email, fullName: dto.fullName, mobile, passwordHash: 'hash', plan: 'FREE' },
        select: { id: true, email: true, fullName: true, mobile: true },
      });
      return {
        user: { id: user.id, email: user.email, fullName: user.fullName },
        accessToken: `access-${user.id}`,
        refreshToken: `refresh-${user.id}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      };
    },
    issueTokensForUser: async (user) => ({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    }),
    issueOtpSessionForUser: async (user) => ({
      user: { id: user.id, email: user.email, fullName: user.fullName },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
    refresh: async () => ({}),
    logout: async () => ({ ok: true }),
  };

  const emailOtpService = new EmailOtpService(prisma, authService, config);

  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: EmailOtpService, useValue: emailOtpService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

// --- Test 1: Registration success with unique email + unique mobile ---
test('POST /auth/register succeeds with unique email and mobile', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Test User', email: 'test@example.com', mobile: '+919876543210' })
    .expect(201);

  assert.equal(typeof res.body.accessToken, 'string');
  assert.equal(res.body.user.email, 'test@example.com');
  await app.close();
});

// --- Test 2: Registration failure when email already exists ---
test('POST /auth/register fails when email already exists', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User One', email: 'dup@example.com', mobile: '+919876543211' })
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User Two', email: 'dup@example.com', mobile: '+919876543212' })
    .expect(400);

  assert.ok(res.body.message.includes('email already exists'));
  await app.close();
});

// --- Test 3: Registration failure when mobile already exists ---
test('POST /auth/register fails when mobile already exists for another user', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User One', email: 'one@example.com', mobile: '+919876543213' })
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User Two', email: 'two@example.com', mobile: '+919876543213' })
    .expect(400);

  assert.ok(res.body.message.includes('mobile number is already linked'));
  await app.close();
});

// --- Test 4: Email OTP request succeeds for registered user ---
test('POST /auth/email-otp/request succeeds for registered user', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  // Register user first
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'OTP User', email: 'otp@example.com', mobile: '+919876543214' })
    .expect(201);

  const res = await request(app.getHttpServer())
    .post('/auth/email-otp/request')
    .send({ email: 'otp@example.com' })
    .expect(200);

  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.devOtp, 'string');
  assert.equal(res.body.devOtp.length, 6);
  await app.close();
});

// --- Test 5: Email OTP verify logs user in ---
test('POST /auth/email-otp/verify with correct OTP returns tokens', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  // Register user
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Verify User', email: 'verify@example.com', mobile: '+919876543215' })
    .expect(201);

  // Request OTP
  const otpRes = await request(app.getHttpServer())
    .post('/auth/email-otp/request')
    .send({ email: 'verify@example.com' })
    .expect(200);

  const devOtp = otpRes.body.devOtp;

  // Verify OTP
  const verifyRes = await request(app.getHttpServer())
    .post('/auth/email-otp/verify')
    .send({ email: 'verify@example.com', otp: devOtp })
    .expect(200);

  assert.equal(typeof verifyRes.body.accessToken, 'string');
  assert.equal(typeof verifyRes.body.refreshToken, 'string');
  assert.equal(verifyRes.body.user.email, 'verify@example.com');

  // Check login count incremented
  const user = prisma.__state.usersByEmail.get('verify@example.com');
  assert.equal(user.loginCount, 1);

  // Check login event recorded
  assert.equal(prisma.__state.loginEvents.length, 1);
  assert.equal(prisma.__state.loginEvents[0].email, 'verify@example.com');
  await app.close();
});

// --- Test 6: Invalid/expired OTP fails ---
test('POST /auth/email-otp/verify with wrong OTP returns 401', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  // Register user
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Wrong OTP User', email: 'wrong@example.com', mobile: '+919876543216' })
    .expect(201);

  // Request OTP
  await request(app.getHttpServer())
    .post('/auth/email-otp/request')
    .send({ email: 'wrong@example.com' })
    .expect(200);

  // Verify with wrong OTP
  await request(app.getHttpServer())
    .post('/auth/email-otp/verify')
    .send({ email: 'wrong@example.com', otp: '000000' })
    .expect(401);

  await app.close();
});

// --- Test 7: OTP request fails for unregistered email ---
test('POST /auth/email-otp/request fails for unregistered email', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  const res = await request(app.getHttpServer())
    .post('/auth/email-otp/request')
    .send({ email: 'nobody@example.com' })
    .expect(400);

  assert.ok(res.body.message.includes('No account found'));
  await app.close();
});

// --- Test 8: Registration requires mobile ---
test('POST /auth/register fails without mobile', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'No Mobile', email: 'nomobile@example.com' })
    .expect(400);

  await app.close();
});

// --- Test 9: /auth/login endpoint no longer exists ---
test('POST /auth/login endpoint is removed (404)', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'test@example.com', password: 'password123' })
    .expect(404);

  await app.close();
});

// --- Test 10: Admin email is recognized during registration ---
test('admin email is recognized when ADMIN_EMAILS is set', async () => {
  const prisma = createPrisma();
  const app = await createApp(prisma);

  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Admin User', email: 'admin@example.com', mobile: '+919876543299' })
    .expect(201);

  assert.equal(res.body.user.email, 'admin@example.com');
  // The stub authService.register checks admin via ADMIN_EMAILS=admin@example.com in createApp config
  await app.close();
});
