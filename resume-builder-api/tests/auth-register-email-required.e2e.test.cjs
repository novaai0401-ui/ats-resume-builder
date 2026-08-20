const test = require('node:test');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { AuthController } = require('../dist/auth/auth.controller.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
const { LinkedInOAuthService } = require('../dist/auth/linkedin-oauth.service.js');
const { AnalyticsService } = require('../dist/analytics/analytics.service.js');
const { EmailVerificationService } = require('../dist/auth/email-verification.service.js');

/** Calls recorded by the EmailVerificationService stub, reset per app. */
let startCalls;

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: {
          register: async (payload) => payload,
          refresh: async () => ({}),
          logout: async () => ({ ok: true }),
        },
      },
      // AuthController deps stubbed so the module compiles
      // (not exercised by these register validation tests).
      { provide: PasswordResetService, useValue: {} },
      { provide: LinkedInOAuthService, useValue: { isConfigured: () => false } },
      { provide: AnalyticsService, useValue: { track: () => {} } },
      {
        provide: EmailVerificationService,
        useValue: {
          start: async (email, meta) => {
            startCalls.push({ email, meta });
            return { sent: true };
          },
        },
      },
    ],
  }).compile();
  startCalls = [];

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

test('POST /auth/register requires email', async () => {
  const app = await createApp();
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User Without Email', password: 'secret123' })
    .expect(400);
  await app.close();
});

// Email-only onboarding: mobile is OPTIONAL at registration (no paid SMS
// verification at this stage). Registration must succeed without it.
test('POST /auth/register succeeds WITHOUT a mobile number (email-only signup)', async () => {
  const app = await createApp();
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Email Only User', email: 'test@example.com', password: 'longenough123' })
    .expect(201);
  await app.close();
});

test('POST /auth/register still accepts a mobile when the user provides one', async () => {
  const app = await createApp();
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'With Mobile', email: 'test2@example.com', mobile: '+919999999999', password: 'longenough123' })
    .expect(201);
  await app.close();
});

// Email ownership gate: step 1 of signup emails a 6-digit code.
test('POST /auth/register/start hands the email to the verification service', async () => {
  const assert = require('node:assert/strict');
  const app = await createApp();
  const res = await request(app.getHttpServer())
    .post('/auth/register/start')
    .set('user-agent', 'test-agent')
    .send({ email: 'new@person.dev' })
    .expect(200);
  assert.deepEqual(res.body, { sent: true });
  assert.equal(startCalls.length, 1);
  assert.equal(startCalls[0].email, 'new@person.dev');
  assert.equal(startCalls[0].meta.userAgent, 'test-agent');
  await app.close();
});

// The register schema accepts the 6-digit code and passes it through, and
// rejects a malformed one at the validation layer.
test('POST /auth/register forwards a valid otp and 400s a malformed one', async () => {
  const assert = require('node:assert/strict');
  const app = await createApp();
  const ok = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Code User', email: 'code@person.dev', password: 'longenough123', otp: '123456' })
    .expect(201);
  assert.equal(ok.body.otp, '123456'); // stub echoes the parsed payload
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'Code User', email: 'code@person.dev', password: 'longenough123', otp: '12ab56' })
    .expect(400);
  await app.close();
});
