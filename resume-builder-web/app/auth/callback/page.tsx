'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens, isCurrentUserAdmin } from '@/src/lib/api';
import { Suspense } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Completing sign-in...');
  const [error, setError] = useState('');
  const exchangedRef = useRef(false);

  useEffect(() => {
    // Prevent double-execution in React strict mode
    if (exchangedRef.current) return;

    const handoff = searchParams.get('handoff');
    const errorParam = searchParams.get('error');
    const provider = searchParams.get('provider') || '';
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Provider';

    // Handle errors from backend redirect
    if (errorParam === 'not_configured') {
      setError(`${providerLabel} sign-in is not yet configured. Please ask the administrator to set up OAuth credentials, or use another sign-in method.`);
      setStatus('');
      return;
    }
    if (errorParam === 'denied') {
      setError('Sign-in was cancelled or denied. Please try again.');
      setStatus('');
      return;
    }
    if (errorParam === 'invalid_state') {
      setError('Sign-in session expired or was tampered with. Please try again.');
      setStatus('');
      return;
    }
    if (errorParam === 'auth_failed') {
      const message = searchParams.get('message') || 'Authentication failed';
      setError(`${providerLabel} sign-in failed: ${message}`);
      setStatus('');
      return;
    }
    if (errorParam) {
      setError(`Sign-in error: ${errorParam}. Please try again.`);
      setStatus('');
      return;
    }

    // Exchange handoff token for real auth data (one-time, server-side)
    if (handoff) {
      exchangedRef.current = true;
      setStatus('Verifying credentials...');

      fetch(`${API_BASE}/auth/social/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: handoff }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || `Server returned ${res.status}`);
          }
          return res.json();
        })
        .then((auth) => {
          if (!auth.accessToken || !auth.userId) {
            throw new Error('Invalid auth response from server.');
          }

          // Store auth tokens (include isAdmin so setAuthTokens can persist it)
          const isAdminFlag = auth.isAdmin === 'true' || auth.isAdmin === true;
          setAuthTokens({
            user: { id: auth.userId, email: auth.email, fullName: auth.fullName, isAdmin: isAdminFlag } as any,
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken,
            expiresAt: auth.expiresAt,
          });

          setStatus('Sign-in successful! Redirecting...');

          // Check for saved return destination (e.g., user clicked premium feature before login)
          const returnTo = typeof window !== 'undefined' ? sessionStorage.getItem('rb_return_to') : null;
          if (returnTo) {
            sessionStorage.removeItem('rb_return_to');
            router.replace(returnTo);
          } else {
            const isAdmin = auth.isAdmin === 'true';
            router.replace(isAdmin ? '/admin/settings' : '/dashboard');
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to complete sign-in. Please try again.');
          setStatus('');
        });
      return;
    }

    // No valid params at all
    setError('Missing sign-in data. Please try again.');
    setStatus('');
  }, [searchParams, router]);

  return (
    <main className="grid">
      <section className="card col-5">
        <h2>{error ? 'Sign-In Issue' : 'Signing In'}</h2>
        {status && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', margin: '0 auto 12px' }} />
            <p className="small">{status}</p>
          </div>
        )}
        {error && (
          <div className="message-banner" style={{ marginTop: 12 }}>
            <p className="small">{error}</p>
            <button className="btn" onClick={() => router.push('/auth/login')} style={{ marginTop: 8 }}>
              Back to Login
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<main className="grid"><section className="card col-5"><p className="small">Processing...</p></section></main>}>
      <CallbackHandler />
    </Suspense>
  );
}
