'use client';

/**
 * Root-level error boundary for Next.js app router.
 *
 * Any uncaught error in a route segment that is not caught by a closer
 * error.tsx bubbles here instead of showing a blank white page.
 *
 * On mobile this matters more than on desktop — users are more likely to
 * lose confidence in an app that crashes invisibly, and less likely to
 * open devtools to diagnose.
 */

import { useEffect } from 'react';
import { TkxAlert, TkxButton, TkxCard, TkxCardBody, TkxCardHeader } from 'tekivex-ui';
import { SUPPORT_EMAIL, supportMailto } from '@/src/lib/support';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console so devtools + error tracking can catch it.
    // Intentionally not sending to a monitoring backend — backend is
    // out of scope for this change.
    console.error('[RootError]', error);
  }, [error]);

  return (
    <main style={{ padding: '24px 0' }}>
      <TkxCard style={{ maxWidth: 560, margin: '0 auto' }}>
        <TkxCardHeader>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
        </TkxCardHeader>
        <TkxCardBody>
          <TkxAlert variant="danger" style={{ marginBottom: 16 }}>
            {error.message || 'An unexpected error occurred.'}
          </TkxAlert>
          {error.digest ? (
            <p className="small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TkxButton onClick={reset}>Try again</TkxButton>
            <TkxButton variant="outline" onClick={() => (window.location.href = '/')}>
              Go to homepage
            </TkxButton>
          </div>
          <p className="small" style={{ color: 'var(--muted)', marginTop: 14, marginBottom: 0 }}>
            Still stuck? Email{' '}
            <a href={supportMailto('Pocket Resume — problem report')}>{SUPPORT_EMAIL}</a>
            {error.digest ? <> and mention reference <code>{error.digest}</code></> : null} — we reply fast.
          </p>
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
