'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAccessToken } from '@/src/lib/api';

type AuthGateProps = {
  children: ReactNode;
  /** Optional message to show while the redirect runs. */
  fallbackMessage?: string;
};

/**
 * Client-side auth gate. Redirects unauthenticated users to `/auth/login`
 * and preserves the intended destination in sessionStorage under
 * `rb_return_to` so the login flow can send them back after signing in.
 *
 * Use this to wrap any page that exposes ATS / resume / career features.
 * Public marketing pages (home, login, register) must NOT be wrapped.
 */
export default function AuthGate({ children, fallbackMessage }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      try {
        const target = pathname || '/dashboard';
        sessionStorage.setItem('rb_return_to', target);
      } catch {
        // sessionStorage may be unavailable — fall through.
      }
      setAuthed(false);
      router.replace('/auth/login');
      return;
    }
    setAuthed(true);
  }, [router, pathname]);

  if (authed === null) {
    return (
      <main className="grid">
        <section className="card col-12">
          <p className="small">Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="grid">
        <section className="card col-12">
          <p className="small">
            {fallbackMessage || 'Please sign in to continue. Redirecting to login...'}
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
