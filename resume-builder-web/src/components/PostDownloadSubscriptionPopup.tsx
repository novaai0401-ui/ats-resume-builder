'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusTrap } from '@/src/lib/use-focus-trap';
import { TkxButton } from 'tekivex-ui';

/**
 * Two-step post-download flow.
 *
 * Stage 1 ("ask"): "ATS score is N. If you want, use our subscription." [Yes / No]
 * Stage 2 ("modal"): Full subscription modal. Cancel is the default (autofocused)
 *   so a careless Enter press dismisses rather than committing the user to pay.
 */
export default function PostDownloadSubscriptionPopup({
  score,
  onClose,
}: {
  score: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<'ask' | 'modal'>('ask');
  // Single trap ref reused across the two stages; the underlying container
  // unmounts/remounts between stages, so the hook re-runs with fresh focus.
  const trapRef = useFocusTrap<HTMLDivElement>({ onClose });

  const handleYes = () => setStage('modal');
  const handleNo = () => onClose();

  if (stage === 'ask') {
    return (
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-dl-ask-title"
        className="session-warning-overlay"
        onClick={onClose}
      >
        <div
          className="session-warning-modal"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 440, textAlign: 'center' }}
        >
          <h3 id="post-dl-ask-title" style={{ marginBottom: 8 }}>Your download is ready</h3>
          <p style={{ margin: '6px 0 14px', color: 'var(--muted)' }}>
            ATS score is <strong>{score ?? '—'}</strong>. If you want to push it to 100% and see your full tech gap, use our subscription.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <TkxButton onClick={handleYes}>Yes, show me</TkxButton>
            <TkxButton variant="outline" autoFocus onClick={handleNo}>No, thanks</TkxButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-dl-sub-title"
      className="session-warning-overlay"
      onClick={onClose}
    >
      <div
        className="session-warning-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: 'left' }}
      >
        <h3 id="post-dl-sub-title" style={{ marginBottom: 8 }}>Unlock full premium optimization</h3>
        <ul className="small" style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Push ATS score from {score ?? '—'} to 100</li>
          <li>Detailed technology-gap analysis</li>
          <li>Personalised learning roadmap &amp; best courses</li>
          <li>Premium career guidance &amp; role benchmarking</li>
        </ul>
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Cancel is the primary / autofocused action per spec. */}
          <TkxButton
            variant="outline"
            autoFocus
            style={{ width: '100%' }}
            onClick={onClose}
          >
            Cancel
          </TkxButton>
          <TkxButton
           
            style={{ width: '100%', background: 'var(--primary)' }}
            onClick={() => {
              onClose();
              router.push('/billing');
            }}
          >
            Continue to subscription
          </TkxButton>
        </div>
      </div>
    </div>
  );
}
