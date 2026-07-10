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
  /** Only required when this other env var is also set. */
  requiredWhen?: string;
  /** Human-readable description. */
  label?: string;
  /**
   * Warn (never hard-fail) even in production. For infra the app degrades
   * gracefully without today, so the safety net can't itself cause an
   * outage on something non-critical (e.g. Redis isn't wired into the code
   * yet — rate limiting is in-process — so a missing REDIS_URL must not
   * crash-loop the deploy).
   */
  warnOnly?: boolean;
};

const REQUIRED_IN_PRODUCTION: Rule[] = [
  // ── Hard-fail: the app is insecure or broken without these. ──
  { key: 'DATABASE_URL', minLength: 20, rejectPlaceholder: true, label: 'Database connection string' },
  { key: 'JWT_SECRET', minLength: 32, rejectPlaceholder: true, rejectWeak: true, label: 'JWT signing secret' },
  { key: 'JWT_REFRESH_SECRET', minLength: 32, rejectPlaceholder: true, rejectWeak: true, label: 'JWT refresh secret' },
  { key: 'CORS_ORIGIN', minLength: 8, rejectPlaceholder: true, label: 'Allowed CORS origins' },
  // Stripe — only enforced if any Stripe key is set (paired webhook secret).
  { key: 'STRIPE_SECRET_KEY', minLength: 20, rejectPlaceholder: true, requiredWhen: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe secret key' },
  { key: 'STRIPE_WEBHOOK_SECRET', minLength: 20, rejectPlaceholder: true, requiredWhen: 'STRIPE_SECRET_KEY', label: 'Stripe webhook secret' },
  // ── Warn-only: important, but the app boots + degrades without them. ──
  // TOKEN_ENC_KEY only matters once a user stores a BYOK provider key;
  // REDIS_* is aspirational (rate limiting is still in-process).
  { key: 'TOKEN_ENC_KEY', minLength: 32, rejectPlaceholder: true, warnOnly: true, label: 'Token encryption key (BYOK)' },
  { key: 'REDIS_URL', minLength: 10, rejectPlaceholder: true, warnOnly: true, label: 'Redis / Upstash URL' },
  { key: 'REDIS_TOKEN', minLength: 10, rejectPlaceholder: true, warnOnly: true, label: 'Redis / Upstash token' },
];

export type EnvValidationResult = { ok: boolean; errors: string[]; warnings: string[] };

/**
 * Pure check (no process.exit, no reliance on NODE_ENV side effects) so it
 * can be unit-tested. Returns hard `errors` (only when in production and the
 * rule is not warn-only) and non-fatal `warnings`.
 */
export function collectEnvIssues(
  env: NodeJS.ProcessEnv = process.env,
  isProduction = String(env.NODE_ENV || '').toLowerCase() === 'production',
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const record = (rule: Rule, msg: string) => {
    if (isProduction && !rule.warnOnly) errors.push(msg);
    else warnings.push(msg);
  };

  for (const rule of REQUIRED_IN_PRODUCTION) {
    const value = String(env[rule.key] || '').trim();
    const label = rule.label || rule.key;
    const minLen = rule.minLength ?? 8;

    // If this rule is conditional, check the dependency.
    if (rule.requiredWhen) {
      const dep = String(env[rule.requiredWhen] || '').trim();
      if (!dep || PLACEHOLDER_RE.test(dep)) continue; // dependency not set, skip
    }

    if (!value) {
      record(rule, `${rule.key} is not set (${label})`);
      continue;
    }
    if (value.length < minLen) {
      record(rule, `${rule.key} is too short (${value.length} chars, need >= ${minLen}) — ${label}`);
      continue;
    }
    if (rule.rejectPlaceholder && PLACEHOLDER_RE.test(value)) {
      record(rule, `${rule.key} looks like a placeholder value — ${label}`);
      continue;
    }
    if (rule.rejectWeak && WEAK_JWT_RE.test(value)) {
      record(rule, `${rule.key} looks like a weak/default secret — ${label}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Call once at startup. In production, exits the process with a clear error
 * if any critical secret is missing/weak/placeholder. Warnings (incl. all
 * warn-only rules) are logged but never fatal.
 */
export function validateProductionEnv(opts: { exit?: boolean } = {}): EnvValidationResult {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const result = collectEnvIssues(process.env, isProduction);

  if (result.warnings.length > 0) {
    console.warn('[env-validation] Non-blocking warnings:');
    for (const w of result.warnings) console.warn(`  ⚠ ${w}`);
  }

  if (result.errors.length > 0) {
    console.error('═══════════════════════════════════════════════════════');
    console.error(' FATAL: Production environment validation failed');
    console.error('═══════════════════════════════════════════════════════');
    for (const e of result.errors) console.error(`  ✗ ${e}`);
    console.error('');
    console.error(' Fix the above environment variables and restart.');
    console.error('═══════════════════════════════════════════════════════');
    if (opts.exit !== false) process.exit(1);
  }

  return result;
}
