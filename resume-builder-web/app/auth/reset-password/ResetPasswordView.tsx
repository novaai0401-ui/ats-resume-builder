'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/src/lib/api';

export default function ResetPasswordView() {
  const router = useRouter();
  const params = useSearchParams();
  const initialEmail = params?.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (initialEmail && !email) setEmail(initialEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Reset code must be a 6-digit number.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await api.resetPassword(email.trim(), otp.trim(), newPassword);
      setMessage(res.message);
      setStatus('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
      setStatus('idle');
    }
  }

  return (
    <main className="grid">
      <section className="card col-5 auth-card">
        <h2 style={{ marginBottom: 4 }}>Set a new password</h2>
        <p className="small" style={{ marginBottom: 16, color: 'var(--fg-muted, #666)' }}>
          Enter the 6-digit code we emailed you and your new password.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label className="label" htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="label" htmlFor="reset-otp">Reset code</label>
          <input
            id="reset-otp"
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />

          <label className="label" htmlFor="reset-new">New password</label>
          <input
            id="reset-new"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Min 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />

          <label className="label" htmlFor="reset-confirm">Confirm password</label>
          <input
            id="reset-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />

          <button className="btn" type="submit" disabled={status === 'submitting' || status === 'done'}>
            {status === 'submitting'
              ? 'Updating…'
              : status === 'done'
                ? 'Password updated'
                : 'Reset password'}
          </button>

          {message ? (
            <div className="message-banner success" role="status">
              <p className="small">{message}</p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => router.push('/auth/login')}
                style={{ marginTop: 8 }}
              >
                Sign in →
              </button>
            </div>
          ) : null}
          {error ? <div className="message-banner"><p className="small">{error}</p></div> : null}

          <Link href="/auth/forgot-password" className="btn ghost" style={{ justifySelf: 'start', fontSize: '0.85rem' }}>
            ← Request a different code
          </Link>
        </form>
      </section>
      <section className="card col-7">
        <h3>Tips</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Codes expire after 15 minutes.</li>
          <li>5 wrong codes locks the form for 15 minutes.</li>
          <li>Use a unique password — we check passwords against known breaches.</li>
        </ul>
      </section>
    </main>
  );
}
