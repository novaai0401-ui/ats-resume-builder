'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getAccessToken } from '@/src/lib/api';
import { buildReturnPath } from '@/src/lib/return-path';

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
  const searchParams = useSearchParams();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      try {
        // R-107: the return path must keep its QUERY STRING. This stored
        // pathname only, so a signed-out user arriving from an assistant
        // at /resume?resumeId=abc landed back on a bare /resume after
        // logging in — the resume they were sent to open was gone, and
        // the whole assistant handoff dead-ended at exactly the moment
        // it had earned a signup.
        sessionStorage.setItem('rb_return_to', buildReturnPath(pathname, searchParams?.toString()));
      } catch {
        // sessionStorage may be unavailable — fall through.
      }
      setAuthed(false);
      router.replace('/auth/login');
      return;
    }
    setAuthed(true);
  }, [router, pathname, searchParams]);

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
