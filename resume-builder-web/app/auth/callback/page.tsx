'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAuthTokens, isCurrentUserAdmin } from '@/src/lib/api';
import { Suspense } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Completing sign-in...');
  const [error, setError] = useState('');
  const exchangedRef = useRef(false);

  useEffect(() => {
    // Prevent double-execution in React strict mode
    if (exchangedRef.current) return;

    // LinkedIn OIDC returns tokens in the URL fragment (#accessToken=…) so they
    // never reach server logs or the Referer header. Handle that first.
    if (typeof window !== 'undefined' && window.location.hash.includes('accessToken=')) {
      exchangedRef.current = true;
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = frag.get('accessToken') || '';
      const refreshToken = frag.get('refreshToken') || '';
      const userId = frag.get('userId') || '';
      if (accessToken && refreshToken && userId) {
        const isAdminFlag = frag.get('isAdmin') === 'true';
        setAuthTokens({
          user: { id: userId, email: frag.get('email') || '', fullName: frag.get('fullName') || '', isAdmin: isAdminFlag } as any,
          accessToken,
          refreshToken,
          expiresAt: frag.get('expiresAt') || undefined,
          plan: frag.get('plan') || 'FREE',
        } as any);
        // Scrub the tokens from the address bar immediately.
        window.history.replaceState(null, '', window.location.pathname);
        setStatus('Sign-in successful! Redirecting...');
        const returnTo = sessionStorage.getItem('rb_return_to');
        if (returnTo) {
          sessionStorage.removeItem('rb_return_to');
          router.replace(returnTo);
        } else {
          router.replace(isAdminFlag ? '/admin/settings' : '/dashboard');
        }
        return;
      }
      setError('Missing sign-in data. Please try again.');
      setStatus('');
      return;
    }

    const handoff = searchParams.get('handoff');
    const errorParam = searchParams.get('error');
    const provider = searchParams.get('provider') || '';
    const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Provider';

    // Handle errors from backend redirect. We map each known error *code*
    // to a user-facing message here — we never display whatever arbitrary
    // `message` query param the backend might have attached, because that
    // used to leak raw Prisma / SQL text to the browser.
    if (errorParam) {
      setError(describeCallbackError(errorParam, providerLabel));
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

/**
 * Map one of the backend's error-code query parameters to a friendly,
 * user-facing sentence. Keep these strings free of internals, stack
 * traces, DB column names, etc. Unknown codes fall through to a generic
 * message so any future server code doesn't accidentally leak.
 */
function describeCallbackError(code: string, providerLabel: string): string {
  switch (code) {
    case 'not_configured':
      return `${providerLabel} sign-in is not yet configured on this server. Please try another sign-in method or contact the administrator.`;
    case 'denied':
      return 'You cancelled the sign-in at the provider. Please try again when you\'re ready.';
    case 'no_code':
      return 'Sign-in was interrupted before it could complete. Please try again.';
    case 'invalid_state':
      return 'This sign-in session expired or was tampered with. Please start again from the login page.';
    case 'unsupported_provider':
      return 'This sign-in provider is not supported on this server.';
    case 'provider_auth_failed':
      return `${providerLabel} rejected the sign-in. Please try again, or use a different provider.`;
    case 'provider_mismatch':
      return `This email is already registered through a different sign-in provider. Please sign in with the provider you used originally.`;
    case 'service_unavailable':
      return 'The service is temporarily unavailable. This usually means the server is being updated. Please try again in a few minutes — no data has been lost.';
    case 'auth_failed':
      return `${providerLabel} sign-in failed. Please try again, or use a different sign-in method.`;
    default:
      return `Sign-in could not be completed. Please try again.`;
  }
}
