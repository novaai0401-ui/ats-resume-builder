'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/src/lib/api';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_HINT,
  PASSWORD_TOO_SHORT_MESSAGE,
  isValidEmail,
  EMAIL_INVALID_MESSAGE,
} from 'resume-builder-shared';
import { PrivacyBadge } from '@/src/components/PrivacyBadge';
import { readPendingReferralCode, storePendingReferralCode } from '@/src/lib/referral';
import { SupportHelpLink } from '@/src/components/SupportHelpLink';
import { readNextParamFromLocation } from '../next-param';

type RouterLike = {
  push: (href: string) => Promise<boolean> | void;
};

const fallbackRouter: RouterLike = {
  push: async () => true,
};

export type LoginPageProps = {
  apiClient?: Pick<typeof api, 'register' | 'loginWithPassword'>;
  routerOverride?: RouterLike;
  defaultMode?: 'login' | 'register';
};

export function LoginPageView({ apiClient = api, routerOverride, defaultMode = 'login' }: LoginPageProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // R-037: a `?ref=CODE` query param anywhere stores a pending
  // referral code; register attaches it. Read here (not in a layout)
  // because this is the page the referral links point at.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      storePendingReferralCode(params.get('ref'));
    } catch {
      /* SSR / private mode */
    }
  }, []);

  async function navigateAfterAuth() {
    // An explicit, validated ?next=<path> wins: it captures the intent
    // that sent the user here (e.g. gallery "Use this template" CTA).
    const next = readNextParamFromLocation();
    if (next) { await router.push(next); return; }
    const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('rb_return_to') : null;
    if (returnTo) { sessionStorage.removeItem('rb_return_to'); await router.push(returnTo); }
    else { await router.push('/dashboard'); }
  }

  async function handlePasswordLogin(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!isValidEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      await apiClient.loginWithPassword(email.trim(), password);
      await navigateAfterAuth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('');
    if (!isValidEmail(regEmail)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    if ((regPassword || '').length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      const referralCode = readPendingReferralCode();
      await apiClient.register({
        fullName: regName.trim(),
        email: regEmail.trim(),
        password: regPassword || undefined,
        ...(referralCode ? { referralCode } : {}),
      });
      // Clear the pending code so it can't double-apply from this
      // browser onto a second account.
      try {
        const { clearPendingReferralCode } = await import('@/src/lib/referral');
        clearPendingReferralCode();
      } catch { /* non-critical */ }
      setStatus('Account created! Redirecting...');
      await navigateAfterAuth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid">
      <section className="card col-5">
        <h2 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <p className="small" style={{ marginBottom: 16, color: 'var(--muted)' }}>
          {mode === 'login'
            ? 'Sign in with your email and password.'
            : 'Get started with your free account.'}
        </p>

        {/* ─── Login form ─── */}
        <div style={{ display: 'grid', gap: 12 }}>
          {mode === 'login' ? (
            <form onSubmit={handlePasswordLogin} noValidate style={{ display: 'grid', gap: 12 }}>
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="input"
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Signing in…' : 'Sign In'}</button>
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.85rem' }}>
                <Link href="/auth/forgot-password" className="auth-forgot-link">Forgot password?</Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} noValidate style={{ display: 'grid', gap: 12 }}>
              <label className="label" htmlFor="reg-name">Full Name</label>
              <input
                id="reg-name"
                className="input"
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="John Doe"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
                minLength={2}
              />
              <label className="label" htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
              <label className="label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                className="input"
                type="password"
                autoComplete="new-password"
                enterKeyHint="go"
                placeholder={PASSWORD_MIN_HINT}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
              <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>{loading ? 'Creating account...' : 'Create Account'}</button>
            </form>
          )}

          {status ? <p className="small" style={{ color: 'var(--success)' }}>{status}</p> : null}
          {error ? (
            <div className="alert alert-error" role="alert" aria-live="assertive">
              {error}
              <div style={{ marginTop: 8 }}>
                <SupportHelpLink
                  variant="button"
                  subject={mode === 'login' ? 'Login issue' : 'Registration issue'}
                />
              </div>
            </div>
          ) : null}

          {mode === 'login' ? (
            <Link href="/auth/register" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
              New here? Create account
            </Link>
          ) : (
            <Link href="/auth/login" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
              Already have an account? Sign in
            </Link>
          )}
          <SupportHelpLink
            message={mode === 'login' ? 'Trouble signing in?' : 'Trouble creating your account?'}
            subject={mode === 'login' ? 'Login issue' : 'Registration issue'}
          />
        </div>
      </section>
      <section className="card col-7">
        <PrivacyBadge variant="login" />
        <h3>Why sign in?</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
          <li>Save and manage multiple resumes</li>
          <li>Get AI-powered ATS optimization</li>
          <li>Identify technology and skill gaps</li>
          <li>Export professional PDF templates</li>
          <li>Access your resumes from any device you sign in on</li>
        </ul>
      </section>
    </main>
  );
}
