/**
 * Production environment validation.
 *
 * Call once at startup. In production, the process exits with a clear error
 * if any critical secret is missing, weak, or still set to a placeholder value.
 * In development, it logs warnings instead of crashing.
 */

const PLACEHOLDER_RE = /^(change[_-]?me|dev[_-]?secret|your[_-]|placeholder|example|sk_test_change_me|whsec_change_me)/i;
const WEAK_JWT_RE = /^(secret|password|123|dev|test|change)/i;

type Rule = {
  key: string;
  /** Minimum length after trimming (default 8). */
  minLength?: number;
  /** Reject values matching common placeholders. */
  rejectPlaceholder?: boolean;
  /** Reject values that look like weak secrets. */
  rejectWeak?: boolean;
  /** Reject values matching a custom pattern (e.g. test-key prefixes). */
  rejectPattern?: RegExp;
  /** Custom message when rejectPattern fires. */
  rejectPatternMessage?: string;
  /** Only required when this other env var is also set. */
  requiredWhen?: string;
  /** Human-readable description. */
  label?: string;
};

const REQUIRED_IN_PRODUCTION: Rule[] = [
  { key: 'DATABASE_URL', minLength: 20, rejectPlaceholder: true, label: 'Database connection string' },
  { key: 'JWT_SECRET', minLength: 32, rejectPlaceholder: true, rejectWeak: true, label: 'JWT signing secret' },
  { key: 'JWT_REFRESH_SECRET', minLength: 32, rejectPlaceholder: true, rejectWeak: true, label: 'JWT refresh secret' },
  { key: 'TOKEN_ENC_KEY', minLength: 32, rejectPlaceholder: true, label: 'Token encryption key' },
  { key: 'CORS_ORIGIN', minLength: 8, rejectPlaceholder: true, label: 'Allowed CORS origins' },
  // Stripe — only enforced if any Stripe key is set
  { key: 'STRIPE_SECRET_KEY', minLength: 20, rejectPlaceholder: true, requiredWhen: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe secret key' },
  { key: 'STRIPE_WEBHOOK_SECRET', minLength: 20, rejectPlaceholder: true, requiredWhen: 'STRIPE_SECRET_KEY', label: 'Stripe webhook secret' },
  // Razorpay — only enforced if any Razorpay key is set. The test-key
  // prefix `rzp_test_` is HARD-blocked in production: the safest mistake
  // is to refuse to boot rather than start collecting real card details
  // against a sandbox merchant account.
  {
    key: 'RAZORPAY_KEY_ID',
    minLength: 20,
    rejectPlaceholder: true,
    rejectPattern: /^rzp_test_/i,
    rejectPatternMessage: 'starts with "rzp_test_" — refusing to boot in production with a sandbox key. Generate a live key at https://dashboard.razorpay.com/app/keys',
    requiredWhen: 'RAZORPAY_KEY_SECRET',
    label: 'Razorpay live Key Id',
  },
  {
    key: 'RAZORPAY_KEY_SECRET',
    minLength: 20,
    rejectPlaceholder: true,
    requiredWhen: 'RAZORPAY_KEY_ID',
    label: 'Razorpay live Key Secret',
  },
  {
    key: 'RAZORPAY_WEBHOOK_SECRET',
    minLength: 12,
    rejectPlaceholder: true,
    requiredWhen: 'RAZORPAY_KEY_ID',
    label: 'Razorpay webhook signing secret',
  },
  // Redis
  { key: 'REDIS_URL', minLength: 10, rejectPlaceholder: true, label: 'Redis / Upstash URL' },
  { key: 'REDIS_TOKEN', minLength: 10, rejectPlaceholder: true, label: 'Redis / Upstash token' },
];

export function validateProductionEnv(): void {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of REQUIRED_IN_PRODUCTION) {
    const value = String(process.env[rule.key] || '').trim();
    const label = rule.label || rule.key;
    const minLen = rule.minLength ?? 8;

    // If this rule is conditional, check the dependency
    if (rule.requiredWhen) {
      const dep = String(process.env[rule.requiredWhen] || '').trim();
      if (!dep || PLACEHOLDER_RE.test(dep)) continue; // dependency not set, skip
    }

    if (!value) {
      const msg = `${rule.key} is not set (${label})`;
      isProduction ? errors.push(msg) : warnings.push(msg);
      continue;
    }

    if (value.length < minLen) {
      const msg = `${rule.key} is too short (${value.length} chars, need >= ${minLen}) — ${label}`;
      isProduction ? errors.push(msg) : warnings.push(msg);
      continue;
    }

    if (rule.rejectPlaceholder && PLACEHOLDER_RE.test(value)) {
      const msg = `${rule.key} looks like a placeholder value — ${label}`;
      isProduction ? errors.push(msg) : warnings.push(msg);
      continue;
    }

    if (rule.rejectWeak && WEAK_JWT_RE.test(value)) {
      const msg = `${rule.key} looks like a weak/default secret — ${label}`;
      isProduction ? errors.push(msg) : warnings.push(msg);
      continue;
    }

    if (rule.rejectPattern && rule.rejectPattern.test(value)) {
      const detail = rule.rejectPatternMessage || `matches a forbidden pattern (${rule.rejectPattern})`;
      const msg = `${rule.key} ${detail} — ${label}`;
      // Sandbox payment keys in production are ALWAYS a hard fail,
      // even when this validator is otherwise dev-warning-only.
      isProduction ? errors.push(msg) : warnings.push(msg);
    }
  }

  // Log warnings in dev
  if (warnings.length > 0 && !isProduction) {
    console.warn('[env-validation] Development environment — non-blocking warnings:');
    for (const w of warnings) {
      console.warn(`  ⚠ ${w}`);
    }
  }

  // Hard-fail in production
  if (errors.length > 0 && isProduction) {
    console.error('═══════════════════════════════════════════════════════');
    console.error(' FATAL: Production environment validation failed');
    console.error('═══════════════════════════════════════════════════════');
    for (const e of errors) {
      console.error(`  ✗ ${e}`);
    }
    console.error('');
    console.error(' Fix the above environment variables and restart.');
    console.error('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}
