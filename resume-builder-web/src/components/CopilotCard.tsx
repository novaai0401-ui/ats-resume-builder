'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TkxButton } from 'tekivex-ui';
import { api, type CopilotPlan } from '@/src/lib/api';

/**
 * Profile Copilot card — the automated "what should I do next?" driver.
 *
 * Auto-loads a plan for the given resume the moment the dashboard shows it:
 * the user asks for nothing, types nothing. The plan itself is prioritised
 * server-side (rule-based always; AI-personalised when the user's subscription
 * or BYOK key allows), and every action deep-links to the exact editor section
 * that fixes it — advice the user cannot act on in one tap is noise.
 */
const SEVERITY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: 'High impact', color: '#b42318', bg: 'rgba(180,35,24,0.12)' },
  medium: { label: 'Medium', color: '#b07906', bg: 'rgba(176,121,6,0.12)' },
  low: { label: 'Polish', color: '#1570ef', bg: 'rgba(21,112,239,0.12)' },
};

export default function CopilotCard({ resumeId }: { resumeId: string }) {
  const [plan, setPlan] = useState<CopilotPlan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setPlan(null);
    api
      .copilotPlan(resumeId)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err: unknown) => {
        // The copilot is an enrichment, never a blocker: a failure renders as
        // one quiet line, not an error card competing with the dashboard.
        if (!cancelled) setError(err instanceof Error ? err.message : 'Copilot unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  if (!resumeId) return null;

  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="copilot-title" data-testid="copilot-card">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 id="copilot-title" style={{ margin: 0 }}>Your AI plan</h2>
        {plan?.aiEnhanced ? (
          <span className="pill">AI-personalised</span>
        ) : plan ? (
          <span className="pill" title="Rule-based plan. Add your own AI key (free) or CallbackCV Plus for a personalised one.">
            Basics
          </span>
        ) : null}
      </div>

      {loading ? <p className="small" style={{ color: 'var(--muted)' }}>Reading your resume…</p> : null}
      {error ? <p className="small" style={{ color: 'var(--muted)' }}>{error}</p> : null}

      {plan ? (
        <>
          <p className="small" style={{ marginTop: 6, color: 'var(--ink)' }}>{plan.assessment}</p>

          {plan.actions.length === 0 ? (
            <p className="small" style={{ color: 'var(--muted)' }}>
              Nothing urgent. Run <Link href="/resume/review">Review &amp; ATS</Link> for the fine-grained pass.
            </p>
          ) : (
            <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {plan.actions.map((action) => {
                const sev = SEVERITY_STYLE[action.severity] ?? SEVERITY_STYLE.medium;
                return (
                  <li
                    key={action.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '8px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  >
                    <span
                      className="small"
                      style={{
                        color: sev.color,
                        background: sev.bg,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {sev.label}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{action.title}</span>
                      <span className="small" style={{ color: 'var(--muted)' }}>{action.detail}</span>
                    </span>
                    <Link href={action.cta} style={{ flexShrink: 0 }}>
                      <TkxButton variant="outline" style={{ padding: '4px 10px' }}>Fix</TkxButton>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {!plan.aiEnhanced && plan.aiSource === 'none' ? (
            <p className="small" style={{ marginTop: 8, color: 'var(--muted)' }}>
              This is the rule-based plan. <Link href="/settings">Add your own AI key (free)</Link> or get{' '}
              <Link href="/billing">CallbackCV Plus</Link> for a plan written against your actual resume.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
