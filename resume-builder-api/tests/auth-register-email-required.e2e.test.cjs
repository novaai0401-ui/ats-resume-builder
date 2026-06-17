const test = require('node:test');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { AuthController } = require('../dist/auth/auth.controller.js');
const { AuthService } = require('../dist/auth/auth.service.js');
const { EmailOtpService } = require('../dist/auth/email-otp.service.js');
const { PasswordResetService } = require('../dist/auth/password-reset.service.js');
const { LinkedInOAuthService } = require('../dist/auth/linkedin-oauth.service.js');
const { AnalyticsService } = require('../dist/analytics/analytics.service.js');

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
      {
        provide: EmailOtpService,
        useValue: {
          requestOtp: async () => ({ ok: true }),
          verifyOtp: async () => ({}),
        },
      },
      // AuthController gained these deps; stub them so the module compiles
      // (not exercised by these register/otp validation tests).
      { provide: PasswordResetService, useValue: {} },
      { provide: LinkedInOAuthService, useValue: { isConfigured: () => false } },
      { provide: AnalyticsService, useValue: { track: () => {} } },
    ],
  }).compile();

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

test('POST /auth/register requires mobile', async () => {
  const app = await createApp();
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ fullName: 'User No Mobile', email: 'test@example.com' })
    .expect(400);
  await app.close();
});
