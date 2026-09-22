'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getAccessToken } from '@/src/lib/api';
import { buildReturnPath } from '@/src/lib/return-path';

type AuthGateProps = {
  children: ReactNode;
  /** Optional message to show while the redirect runs. */
  fallbackMessage?: string;
};

/** The "still deciding" panel. Shared so the Suspense fallback and the
 *  pre-check state are visually identical — the boundary below must not
 *  make the page flicker through a different layout.
 *
 *  C-005 requires `role="status"` + `aria-live` on loading states. This
 *  panel is the loading state for all seventeen gated pages, in both of
 *  the places it renders: the Suspense fallback while `useSearchParams()`
 *  resolves on a client navigation, and the pre-check state before the
 *  token read settles. Without the live region a screen-reader user gets
 *  silence on every gated route — the page changed and nothing announced
 *  it.
 *
 *  Deliberately NO `aria-busy`. On a live region, `aria-busy="true"` tells
 *  assistive technology to hold announcements until it flips to `false` —
 *  it means "mid-update, more changes coming". This region never flips:
 *  when auth resolves, the gate returns a different tree and the paragraph
 *  unmounts, so a held announcement is simply dropped and the user hears
 *  nothing. That would defeat the whole point of adding the live region.
 *  Its content is also a single complete sentence, never incrementally
 *  built, so there is nothing to batch. C-005 requires `role="status"` +
 *  `aria-live`; it does not ask for `aria-busy`. */
function CheckingSession() {
  return (
    <main className="grid">
      <section className="card col-12">
        <p className="small" role="status" aria-live="polite">
          Checking your session...
        </p>
      </section>
    </main>
  );
}

function AuthGateInner({ children, fallbackMessage }: AuthGateProps) {
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
    return <CheckingSession />;
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

/**
 * Client-side auth gate. Redirects unauthenticated users to `/auth/login`
 * and preserves the intended destination in sessionStorage under
 * `rb_return_to` so the login flow can send them back after signing in.
 *
 * Use this to wrap any page that exposes ATS / resume / career features.
 * Public marketing pages (home, login, register) must NOT be wrapped.
 *
 * The Suspense boundary is load-bearing, not decoration. `useSearchParams()`
 * opts a component out of static prerendering, and Next fails the
 * production build outright — "useSearchParams() should be wrapped in a
 * suspense boundary" — for every statically rendered page that reaches one
 * without a boundary above it. Seventeen pages wrap themselves in AuthGate,
 * so without this the whole web build dies on the first of them to
 * prerender. Keeping the boundary HERE rather than in each page means a
 * new gated page cannot reintroduce the failure by forgetting it.
 */
export default function AuthGate({ children, fallbackMessage }: AuthGateProps) {
  return (
    <Suspense fallback={<CheckingSession />}>
      <AuthGateInner fallbackMessage={fallbackMessage}>{children}</AuthGateInner>
    </Suspense>
  );
}
