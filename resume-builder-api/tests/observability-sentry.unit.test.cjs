const assert = require('node:assert/strict');
const test = require('node:test');
const { isSentryEnabled, captureException, flushSentry, initSentry } = require('../dist/observability/sentry.js');
const { SentryInterceptor } = require('../dist/observability/sentry.interceptor.js');
const { HttpException } = require('@nestjs/common');
const { throwError, firstValueFrom } = require('rxjs');

// Sentry must be a complete no-op unless SENTRY_DSN is configured. These
// tests run WITHOUT a DSN, so nothing should be enabled and nothing thrown.

test('Sentry is disabled when SENTRY_DSN is not set', () => {
  assert.equal(isSentryEnabled(), false);
});

test('initSentry() without a DSN is a no-op (stays disabled, no throw)', () => {
  const prev = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    initSentry();
    assert.equal(isSentryEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.SENTRY_DSN = prev;
  }
});

test('captureException / flushSentry are safe no-ops when disabled', async () => {
  assert.doesNotThrow(() => captureException(new Error('boom'), { route: '/x', userId: 'u1' }));
  await assert.doesNotReject(() => flushSentry(10));
});

// The interceptor short-circuits (no capture path) when Sentry is disabled,
// and must always re-throw the original error so exception filters still run.
test('SentryInterceptor re-throws the original error', async () => {
  const interceptor = new SentryInterceptor();
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method: 'GET', originalUrl: '/boom' }) }),
  };
  const original = new HttpException('kaboom', 500);
  const next = { handle: () => throwError(() => original) };
  const result$ = interceptor.intercept(ctx, next);
  await assert.rejects(
    () => firstValueFrom(result$),
    (e) => {
      assert.equal(e, original, 'must re-throw the exact original error');
      return true;
    },
  );
});

test('SentryInterceptor passes through a successful response untouched', async () => {
  const { of } = require('rxjs');
  const interceptor = new SentryInterceptor();
  const ctx = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({}) }) };
  const value = await firstValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: 1 }) }));
  assert.deepEqual(value, { ok: 1 });
});
