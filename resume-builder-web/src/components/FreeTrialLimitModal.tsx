'use client';

import Link from 'next/link';
import { useFocusTrap } from '@/src/lib/use-focus-trap';
import type { FreeTrialBlock } from '@/src/lib/free-trial';

/**
 * R-098 — the "you've already used this one" popup.
 *
 * Shown when the server refuses a second free run of an AI feature. Two
 * shapes, driven entirely by the server payload (never a client guess):
 *
 *   • Some features still unused → lead with what's LEFT. The user came to
 *     do a job; the most useful thing we can say is "here are N other AI
 *     tools you haven't spent yet", with the used ones struck through so the
 *     ledger is honest.
 *   • Every feature spent → the upgrade ask, with the same ledger shown as
 *     proof of what they already got for free.
 *
 * Adding your own AI key stays visible in both states: it is genuinely free
 * and unlimited, and hiding it to push the plan would be the kind of copy
 * C-003 exists to prevent.
 */
export default function FreeTrialLimitModal({
  block,
  onClose,
}: {
  block: FreeTrialBlock;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>({ onClose });
  const unused = block.features.filter((f) => !f.used);
  const used = block.features.filter((f) => f.used);

  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-trial-title"
      className="session-warning-overlay"
      onClick={onClose}
      data-testid="free-trial-modal"
    >
      <div
        className="session-warning-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, textAlign: 'left', maxHeight: '86vh', overflowY: 'auto' }}
      >
        <h3 id="free-trial-title" style={{ marginBottom: 8 }}>
          {block.exhausted
            ? "You've used every free AI run"
            : `You've already used your free ${block.featureLabel} run`}
        </h3>

        <p className="small" style={{ margin: '0 0 14px', color: 'var(--muted)', lineHeight: 1.6 }}>
          {block.exhausted ? (
            <>
              Every AI feature here is free <strong>once</strong> — you&rsquo;ve now used all{' '}
              {block.totalCount}. To keep using AI, get the ₹499/mo plan for unlimited runs, or add
              your own AI key in Settings and run everything on your key (free, unlimited).
            </>
          ) : (
            <>
              Each AI feature is free <strong>one time only</strong>, and you can&rsquo;t use any
              feature for free more than once. You&rsquo;ve used {block.usedCount} of{' '}
              {block.totalCount} — here&rsquo;s what you can still run for free.
            </>
          )}
        </p>

        {unused.length > 0 ? (
          <>
            <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>
              Still free for you ({unused.length})
            </h4>
            <ul
              data-testid="free-trial-unused"
              style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 8 }}
            >
              {unused.map((feature) => (
                <li
                  key={feature.key}
                  style={{
                    border: '1px solid var(--border, #e2e2e2)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <strong style={{ display: 'block', fontSize: 14 }}>{feature.label}</strong>
                    <span className="small" style={{ color: 'var(--muted)' }}>{feature.blurb}</span>
                  </span>
                  <Link className="btn ghost" href={feature.href} onClick={onClose} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Use free
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {used.length > 0 ? (
          <>
            <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Already used ({used.length})</h4>
            <ul
              data-testid="free-trial-used"
              className="small"
              style={{ margin: '0 0 16px', paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.8 }}
            >
              {used.map((feature) => (
                <li key={feature.key}>{feature.label}</li>
              ))}
            </ul>
          </>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href="/pricing" onClick={onClose}>
            {block.exhausted ? 'Upgrade for unlimited AI' : 'Get unlimited AI — ₹499/mo'}
          </Link>
          <Link className="btn ghost" href="/settings" onClick={onClose}>
            Add my own AI key (free)
          </Link>
          <button className="btn secondary" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
