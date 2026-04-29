'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/src/lib/api';

type RouterLike = {
  push: (href: string) => Promise<boolean> | void;
};

const fallbackRouter: RouterLike = {
  push: async () => true,
};

export type LoginPageProps = {
  apiClient?: Pick<typeof api, 'register' | 'loginWithPassword' | 'requestLoginOtp' | 'loginWithOtp'>;
  routerOverride?: RouterLike;
  defaultMode?: 'login' | 'register';
};

export function LoginPageView({ apiClient = api, routerOverride, defaultMode = 'login' }: LoginPageProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // OTP login is the default. Users with existing passwords can flip
  // to the password form via the "Use password instead" link below.
  // Both flows hit the same backend /auth/login or /auth/verify-otp
  // and produce the same { accessToken, refreshToken, user } payload,
  // so downstream code (session handling, redirects) is identical.
  const [loginMethod, setLoginMethod] = useState<'otp' | 'password'>('otp');
  const [otpStage, setOtpStage] = useState<'email' | 'code'>('email');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function navigateAfterAuth() {
    const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('rb_return_to') : null;
    if (returnTo) { sessionStorage.removeItem('rb_return_to'); await router.push(returnTo); }
    else { await router.push('/dashboard'); }
  }

  async function handlePasswordLogin(event: React.FormEvent) {
    event.preventDefault();
    setError('');
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

  async function handleRequestOtp(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.requestLoginOtp(email.trim());
      setOtpStage('code');
      setStatus('We just emailed you a 6-digit code. It expires in 10 minutes.');
      // Mirror the server's 60s resend cooldown in the UI so users
      // don't hammer the button and trigger a 429.
      setResendCooldown(60);
      const tick = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) { clearInterval(tick); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.loginWithOtp(email.trim(), otp.trim());
      await navigateAfterAuth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    try {
      await apiClient.register({
        fullName: regName.trim(),
        email: regEmail.trim(),
        mobile: regMobile.trim(),
        password: regPassword || undefined,
      });
      setStatus('Account created! Redirecting...');
      await router.push('/dashboard');
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
        <p className="small" style={{ marginBottom: 16, color: 'var(--fg-muted, #666)' }}>
          {mode === 'login'
            ? 'Enter your email — we’ll send you a one-time code. No password needed.'
            : 'Get started with your free account.'}
        </p>

        {/* ─── Login form ─── */}
        <div style={{ display: 'grid', gap: 12 }}>
          {mode === 'login' ? (
            loginMethod === 'otp' ? (
              otpStage === 'email' ? (
                <form onSubmit={handleRequestOtp} style={{ display: 'grid', gap: 12 }}>
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
                    enterKeyHint="send"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? 'Sending…' : 'Send code'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ justifySelf: 'start', fontSize: '0.85rem' }}
                    onClick={() => { setLoginMethod('password'); setError(''); setStatus(''); }}
                  >
                    Use password instead
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={{ display: 'grid', gap: 12 }}>
                  <label className="label" htmlFor="login-otp">6-digit code sent to {email}</label>
                  <input
                    id="login-otp"
                    className="input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    enterKeyHint="go"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    style={{ letterSpacing: '0.4em', fontSize: '1.1rem', textAlign: 'center' }}
                  />
                  <button className="btn" type="submit" disabled={loading || otp.length !== 6}>
                    {loading ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => { setOtpStage('email'); setOtp(''); setError(''); setStatus(''); }}
                    >
                      Change email
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={resendCooldown > 0 || loading}
                      onClick={() => handleRequestOtp({ preventDefault() {} } as React.FormEvent)}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handlePasswordLogin} style={{ display: 'grid', gap: 12 }}>
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
                <button className="btn" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => { setLoginMethod('otp'); setError(''); setStatus(''); }}
                  >
                    Email me a code instead
                  </button>
                  <Link href="/auth/forgot-password" className="auth-forgot-link">Forgot password?</Link>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={handleRegister} style={{ display: 'grid', gap: 12 }}>
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
              <label className="label" htmlFor="reg-mobile">Mobile</label>
              <input
                id="reg-mobile"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                placeholder="+919XXXXXXXXX"
                value={regMobile}
                onChange={(e) => setRegMobile(e.target.value)}
                required
                minLength={10}
              />
              <label className="label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                className="input"
                type="password"
                autoComplete="new-password"
                enterKeyHint="go"
                placeholder="Min 8 characters"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                minLength={8}
              />
              <button className="btn" type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Create Account'}</button>
            </form>
          )}

          {status ? <p className="small" style={{ color: '#1e5b35' }}>{status}</p> : null}
          {error ? <div className="message-banner"><p className="small">{error}</p></div> : null}

          {mode === 'login' ? (
            <Link href="/auth/register" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
              New here? Create account
            </Link>
          ) : (
            <Link href="/auth/login" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
              Already have an account? Sign in
            </Link>
          )}
        </div>
      </section>
      <section className="card col-7">
        <h3>Why sign in?</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
          <li>Save and manage multiple resumes</li>
          <li>Get AI-powered ATS optimization</li>
          <li>Identify technology and skill gaps</li>
          <li>Export professional PDF templates</li>
          <li>Sync across all your devices</li>
        </ul>
      </section>
    </main>
  );
}
