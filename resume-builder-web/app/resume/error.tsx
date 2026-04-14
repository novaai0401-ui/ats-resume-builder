'use client';

/**
 * Error boundary scoped to /resume/* routes.
 *
 * The editor is the most complex page and the most likely to throw from
 * a bad parse/save. Trapping here keeps the topnav and shell visible so
 * users can navigate away rather than losing the whole app.
 */

import { useEffect } from 'react';
import { TkxAlert, TkxButton, TkxCard, TkxCardBody, TkxCardHeader } from 'tekivex-ui';

export default function ResumeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ResumeError]', error);
  }, [error]);

  return (
    <main style={{ padding: '24px 0' }}>
      <TkxCard style={{ maxWidth: 720, margin: '0 auto' }}>
        <TkxCardHeader>
          <h2 style={{ margin: 0 }}>Couldn&apos;t load your resume</h2>
        </TkxCardHeader>
        <TkxCardBody>
          <TkxAlert variant="danger" style={{ marginBottom: 16 }}>
            {error.message || 'An unexpected error occurred while loading the editor.'}
          </TkxAlert>
          <p className="small" style={{ marginBottom: 16 }}>
            Your last saved changes are still safe. You can retry, or open the
            dashboard to pick a different resume.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TkxButton onClick={reset}>Retry</TkxButton>
            <TkxButton variant="outline" onClick={() => (window.location.href = '/dashboard')}>
              Back to dashboard
            </TkxButton>
          </div>
        </TkxCardBody>
      </TkxCard>
    </main>
  );
}
