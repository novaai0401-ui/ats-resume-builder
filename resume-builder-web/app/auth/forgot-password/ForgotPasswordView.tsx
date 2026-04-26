'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/src/lib/api';

export default function ForgotPasswordView() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setStatus('sending');
    try {
      const res = await api.forgotPassword(email.trim());
      setMessage(res.message);
      setStatus('sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset code.');
      setStatus('idle');
    }
  }

  function goToReset() {
    const params = new URLSearchParams({ email: email.trim() });
    router.push(`/auth/reset-password?${params.toString()}`);
  }

  return (
    <main className="grid">
      <section className="card col-5 auth-card">
        <h2 style={{ marginBottom: 4 }}>Reset your password</h2>
        <p className="small" style={{ marginBottom: 16, color: 'var(--fg-muted, #666)' }}>
          We&apos;ll email you a 6-digit code if an account exists for that address.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label className="label" htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send reset code'}
          </button>

          {message ? (
            <div className="message-banner success" role="status">
              <p className="small">{message}</p>
              <button type="button" className="btn ghost" onClick={goToReset} style={{ marginTop: 8 }}>
                I have a code — continue →
              </button>
            </div>
          ) : null}
          {error ? <div className="message-banner"><p className="small">{error}</p></div> : null}

          <Link href="/auth/login" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
            ← Back to sign in
          </Link>
        </form>
      </section>
      <section className="card col-7">
        <h3>How it works</h3>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Enter your email — we send a 6-digit code if your account exists.</li>
          <li>Open the email and copy the code.</li>
          <li>Set a new password (min 8 characters).</li>
          <li>Sign in with your new password.</li>
        </ol>
        <p className="small" style={{ marginTop: 12, color: 'var(--fg-muted, #666)' }}>
          For security, our response is the same whether or not the email is registered.
          If you don&apos;t receive an email within a few minutes, double-check the address
          you used to register.
        </p>
      </section>
    </main>
  );
}
