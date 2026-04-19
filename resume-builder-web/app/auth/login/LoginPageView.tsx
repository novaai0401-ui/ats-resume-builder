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
  apiClient?: Pick<typeof api, 'register' | 'loginWithPassword'>;
  routerOverride?: RouterLike;
  defaultMode?: 'login' | 'register';
};

/**
 * Social login providers — always visible.
 * Each links to a backend OAuth start route that redirects to the provider.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const SOCIAL_PROVIDERS = [
  { id: 'google',   name: 'Google',   url: `${API_BASE}/auth/social/google/start` },
  { id: 'github',   name: 'GitHub',   url: `${API_BASE}/auth/social/github/start` },
  { id: 'linkedin', name: 'LinkedIn', url: `${API_BASE}/auth/social/linkedin/start` },
  { id: 'yahoo',    name: 'Yahoo',    url: `${API_BASE}/auth/social/yahoo/start` },
];

export function LoginPageView({ apiClient = api, routerOverride, defaultMode = 'login' }: LoginPageProps = {}) {
  const nextRouter = process.env.NEXT_TEST_MOCK_ROUTER === '1' ? null : useRouter();
  const router = routerOverride ?? nextRouter ?? fallbackRouter;

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Login state
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

  async function handlePasswordLogin(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiClient.loginWithPassword(email.trim(), password);
      const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('rb_return_to') : null;
      if (returnTo) { sessionStorage.removeItem('rb_return_to'); await router.push(returnTo); }
      else { await router.push('/dashboard'); }
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
          {mode === 'login' ? 'Choose your preferred sign-in method.' : 'Get started with your free account.'}
        </p>

        {/* ─── Social Provider Buttons (always visible) ─── */}
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          {SOCIAL_PROVIDERS.map((provider) => (
            <a
              key={provider.id}
              href={provider.url}
              className="btn secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textDecoration: 'none',
                padding: '12px 16px',
                fontSize: '0.95rem',
              }}
            >
              Continue with {provider.name}
            </a>
          ))}
        </div>

        {/* ─── Divider ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border, #ddd)' }} />
          <span className="small" style={{ color: 'var(--fg-muted, #888)' }}>or use email</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border, #ddd)' }} />
        </div>

        {/* ─── Email/Password Form ─── */}
        <div style={{ display: 'grid', gap: 12 }}>
          {mode === 'login' ? (
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
              <button className="btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
            </form>
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
