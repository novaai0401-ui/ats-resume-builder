const test = require('node:test');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { AuthController } = require('../dist/auth/auth.controller.js');
const { AuthService } = require('../dist/auth/auth.service.js');
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
      // AuthController deps stubbed so the module compiles
      // (not exercised by these register validation tests).
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
