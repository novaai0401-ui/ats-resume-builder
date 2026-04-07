'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TkxButton, TkxInput, TkxCard, TkxCardBody, TkxAlert, TkxDivider } from 'tekivex-ui';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <TkxCard as="section" className="col-5" padding="lg">
        <TkxCardBody>
          <h2 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <p style={{ marginBottom: 16, fontSize: '0.9rem', color: '#666' }}>
            {mode === 'login' ? 'Choose your preferred sign-in method.' : 'Get started with your free account.'}
          </p>

          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {SOCIAL_PROVIDERS.map((provider) => (
              <a
                key={provider.id}
                href={provider.url}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  padding: '12px 16px',
                  fontSize: '0.95rem',
                  border: '1px solid #d9e3ec',
                  borderRadius: 8,
                  background: '#fff',
                  color: 'inherit',
                  fontWeight: 500,
                }}
              >
                Continue with {provider.name}
              </a>
            ))}
          </div>

          <TkxDivider style={{ margin: '8px 0 16px' }}>or use email</TkxDivider>

          <div style={{ display: 'grid', gap: 12 }}>
            {mode === 'login' ? (
              <form onSubmit={handlePasswordLogin} style={{ display: 'grid', gap: 12 }}>
                <TkxInput
                  label="Email"
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <TkxInput
                  label="Password"
                  id="login-password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <TkxButton type="submit" isFullWidth isLoading={loading} loadingText="Signing in...">
                  Sign In
                </TkxButton>
              </form>
            ) : (
              <form onSubmit={handleRegister} style={{ display: 'grid', gap: 12 }}>
                <TkxInput
                  label="Full Name"
                  id="reg-name"
                  type="text"
                  placeholder="John Doe"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                  minLength={2}
                />
                <TkxInput
                  label="Email"
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
                <TkxInput
                  label="Mobile"
                  id="reg-mobile"
                  type="tel"
                  inputMode="numeric"
                  placeholder="+919XXXXXXXXX"
                  value={regMobile}
                  onChange={(e) => setRegMobile(e.target.value)}
                  required
                  minLength={10}
                />
                <TkxInput
                  label="Password"
                  id="reg-password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <TkxButton type="submit" isFullWidth isLoading={loading} loadingText="Creating account...">
                  Create Account
                </TkxButton>
              </form>
            )}

            {status ? <p style={{ fontSize: '0.85rem', color: '#1e5b35' }}>{status}</p> : null}
            {error ? <TkxAlert variant="danger">{error}</TkxAlert> : null}

            {mode === 'login' ? (
              <TkxButton variant="ghost" size="sm" type="button" onClick={() => setMode('register')}>
                New here? Create account
              </TkxButton>
            ) : (
              <TkxButton variant="ghost" size="sm" type="button" onClick={() => setMode('login')}>
                Already have an account? Sign in
              </TkxButton>
            )}
          </div>
        </TkxCardBody>
      </TkxCard>

      <TkxCard as="section" className="col-7" padding="lg">
        <TkxCardBody>
          <h3>Why sign in?</h3>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8, fontSize: '0.9rem' }}>
            <li>Save and manage multiple resumes</li>
            <li>Get AI-powered ATS optimization</li>
            <li>Identify technology and skill gaps</li>
            <li>Export professional PDF templates</li>
            <li>Sync across all your devices</li>
          </ul>
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
