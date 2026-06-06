const assert = require('node:assert/strict');
const test = require('node:test');
const { validateProductionEnv } = require('../dist/env-validation.js');

// The Razorpay startup safety check refuses to boot a production
// server with sandbox keys. A sandbox-key launch would happily accept
// real credit card details from real users while the merchant
// account is incapable of capturing them — silent revenue loss + a
// support nightmare. The "safest mistake" here is to refuse to boot.

// validateProductionEnv calls process.exit(1) on hard failure. Wrap
// it so the test can observe without ending the test process.
function runWithEnv(overrides, isProduction = true) {
  const oldEnv = { ...process.env };
  const oldExit = process.exit;
  const oldErr = console.error;
  const oldWarn = console.warn;

  // Reset to a known-good baseline so the rest of the production
  // validator doesn't fail on unrelated reasons (missing JWT, etc.).
  const baseline = {
    NODE_ENV: isProduction ? 'production' : 'development',
    DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app',
    JWT_SECRET: 'x'.repeat(48),
    JWT_REFRESH_SECRET: 'y'.repeat(48),
    TOKEN_ENC_KEY: 'z'.repeat(48),
    CORS_ORIGIN: 'https://app.example.com',
    REDIS_URL: 'rediss://default:tok@redis.example.com:6379',
    REDIS_TOKEN: 'redis-token-1234567890',
  };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, baseline, overrides);

  let exited = false;
  let exitCode = 0;
  const errorLines = [];
  const warnLines = [];
  process.exit = ((code) => {
    exited = true;
    exitCode = Number(code || 0);
    // Throw to abort execution like the real exit would (but catchable).
    throw new Error(`__test_exit_${exitCode}__`);
  });
  console.error = (...args) => { errorLines.push(args.join(' ')); };
  console.warn = (...args) => { warnLines.push(args.join(' ')); };

  try {
    validateProductionEnv();
  } catch (err) {
    if (!/^__test_exit_/.test(String(err && err.message))) throw err;
  } finally {
    process.exit = oldExit;
    console.error = oldErr;
    console.warn = oldWarn;
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, oldEnv);
  }

  return { exited, exitCode, errorLines, warnLines };
}

// --------------------------------------------------------------------
// Hard failure cases — refuse to boot
// --------------------------------------------------------------------

test('production: REFUSES to boot with rzp_test_ Razorpay key', () => {
  const { exited, errorLines } = runWithEnv({
    RAZORPAY_KEY_ID: 'rzp_test_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'sandbox_secret_xxxxxxxxxxxxxxxxxxxx',
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_1234567890',
  });
  assert.equal(exited, true, 'expected process.exit to be called');
  const joined = errorLines.join('\n');
  assert.match(joined, /RAZORPAY_KEY_ID/);
  assert.match(joined, /rzp_test_/);
});

test('production: REFUSES to boot with placeholder Razorpay secret', () => {
  const { exited, errorLines } = runWithEnv({
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'change_me_secret',
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_1234567890',
  });
  assert.equal(exited, true);
  assert.match(errorLines.join('\n'), /RAZORPAY_KEY_SECRET/);
});

test('production: REFUSES to boot when KEY_ID is set but secret is missing', () => {
  const { exited, errorLines } = runWithEnv({
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    // RAZORPAY_KEY_SECRET intentionally unset
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_1234567890',
  });
  assert.equal(exited, true);
  assert.match(errorLines.join('\n'), /RAZORPAY_KEY_SECRET/);
});

test('production: REFUSES to boot when webhook secret is too short', () => {
  const { exited, errorLines } = runWithEnv({
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'real_secret_xxxxxxxxxxxxxx',
    RAZORPAY_WEBHOOK_SECRET: 'short',
  });
  assert.equal(exited, true);
  assert.match(errorLines.join('\n'), /RAZORPAY_WEBHOOK_SECRET/);
});

// --------------------------------------------------------------------
// Pass cases
// --------------------------------------------------------------------

test('production: boots cleanly with valid live Razorpay keys', () => {
  const { exited, errorLines } = runWithEnv({
    RAZORPAY_KEY_ID: 'rzp_live_1234567890abcdef',
    RAZORPAY_KEY_SECRET: 'real_secret_xxxxxxxxxxxxxxxxxxxxx',
    RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_1234567890',
  });
  assert.equal(exited, false, `unexpectedly exited; errors:\n${errorLines.join('\n')}`);
});

test('production: tolerates Razorpay being entirely unset (operator runs free-only mode)', () => {
  // Razorpay rules are requiredWhen-gated. Free-only operators with
  // no payments configured shouldn't be forced to provide them.
  const { exited, errorLines } = runWithEnv({});
  assert.equal(exited, false, `unexpectedly exited; errors:\n${errorLines.join('\n')}`);
});

// --------------------------------------------------------------------
// Development environment: warn, do not crash
// --------------------------------------------------------------------

test('development: rzp_test_ keys WARN but do NOT crash the process', () => {
  const { exited, warnLines } = runWithEnv(
    {
      RAZORPAY_KEY_ID: 'rzp_test_1234567890abcdef',
      RAZORPAY_KEY_SECRET: 'sandbox_secret_xxxxxxxxxxxxxxxxx',
      RAZORPAY_WEBHOOK_SECRET: 'webhook_secret_1234567890',
    },
    false, // NODE_ENV=development
  );
  assert.equal(exited, false, 'must not crash in dev');
  // We don't strictly assert the warning content because the dev path
  // can be quiet; the absence of a crash is the contract that matters
  // for local development with a sandbox merchant.
});
