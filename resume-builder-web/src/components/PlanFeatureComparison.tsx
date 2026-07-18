'use client';

/**
 * Side-by-side Free vs Paid feature matrix shown on the billing page,
 * plus a dedicated "what does ₹49 unlock?" explainer.
 *
 * Why this exists: users repeatedly ask "what do I actually get if I
 * pay?" and "why am I being asked for ₹49?". The current billing page
 * lists plan features but doesn't put Free next to Paid in a single
 * scan, and never explains the one-off ₹49 PDF charge at all. This
 * component fills both gaps.
 *
 * Source of truth: resume-builder-api/src/billing/plan-limits.ts
 * (FREE 8k tokens / 2 scans / 5 PDFs / 2 resumes;
 *  PRO — sold as "CallbackCV Plus" — 120k / 300 / 200 / 100 @ ₹499/mo)
 * Keep this file in sync if those limits ever move.
 *
 * Note: the only paid plan is "CallbackCV Plus" (the 'PRO' plan
 * value internally). The "Free" column doubles as the BYOK path: every
 * AI feature is usable on Free when the user adds their own AI key.
 */

type Row = {
  feature: string;
  free: string | boolean;
  /** "CallbackCV Plus" column (the 'PRO' plan value internally). */
  plus: string | boolean;
};

const ROWS: Row[] = [
  // Quotas
  { feature: 'Saved resumes', free: '2', plus: '100' },
  { feature: 'ATS scans / month', free: '2', plus: '300' },
  { feature: 'PDF + Word exports / month', free: '₹49 each', plus: '₹49 each' },
  { feature: 'AI tokens / month', free: 'Your own key', plus: '120,000' },

  // Core
  { feature: 'Resume editor & ATS-safe templates', free: true, plus: true },
  { feature: 'Rule-based ATS scoring', free: true, plus: true },
  { feature: 'Action-verb + bullet-length checks', free: true, plus: true },
  { feature: 'Job tracker (Kanban)', free: true, plus: true },
  { feature: 'Version history (up to 25 per resume)', free: true, plus: true },
  { feature: 'Bring-your-own AI key (BYOK)', free: true, plus: true },

  // AI — free with your own key, or our AI on Plus
  { feature: 'AI Resume Critique (LLM rewrites)', free: 'With your key', plus: 'Our AI' },
  { feature: 'AI Bullet Rewriter (✨ one-tap)', free: 'With your key', plus: 'Our AI' },
  { feature: 'JD Match Score + missing keywords', free: 'With your key', plus: 'Our AI' },
  { feature: 'Tech Gap Analysis', free: 'With your key', plus: 'Our AI' },
  { feature: 'Cover Letter Studio', free: 'With your key', plus: 'Our AI' },
  { feature: 'Mentor Mode (career insights)', free: 'With your key', plus: 'Our AI' },
  { feature: 'Mentor Chat (resume-aware)', free: 'With your key', plus: 'Our AI' },
  { feature: 'Interview Prep Cards (8 per role)', free: 'With your key', plus: 'Our AI' },
  { feature: 'Outcome Loop (response / interview / offer tracking)', free: true, plus: true },

  // Plus perks
  { feature: 'Salary band hints (25/50/75 percentile)', free: false, plus: true },
  { feature: 'Priority AI queue (skip rate-limits)', free: false, plus: true },
  { feature: 'Priority support (24h SLA + Slack)', free: false, plus: true },
];

function cell(value: string | boolean): React.ReactNode {
  if (value === true) {
    return (
      <span aria-label="Included" style={{ color: 'var(--success)', fontWeight: 700 }}>
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span aria-label="Not included" style={{ color: 'var(--muted)' }}>
        —
      </span>
    );
  }
  return <span style={{ color: 'var(--primary)' }}>{value}</span>;
}

export default function PlanFeatureComparison() {
  return (
    <section className="card col-12" aria-labelledby="plan-compare-title">
      <h2 id="plan-compare-title" style={{ marginTop: 0 }}>
        Free vs Paid — what changes
      </h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
        Everything in the Free tier stays free forever. Add your own AI key to use every
        AI feature for free, or get CallbackCV Plus (₹499/mo) for our AI everywhere
        and the higher monthly quotas. Cancel anytime.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14,
            minWidth: 560,
          }}
        >
          <thead>
            <tr style={{ background: 'var(--surface-alt)', textAlign: 'left' }}>
              <th
                scope="col"
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', width: '46%' }}
              >
                Feature
              </th>
              <th
                scope="col"
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}
              >
                Free
              </th>
              <th
                scope="col"
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'center',
                  color: 'var(--primary)',
                }}
              >
                CallbackCV Plus
                <span className="small" style={{ display: 'block', fontWeight: 400, color: 'var(--muted)' }}>
                  ₹499/mo
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.feature}
                style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface-alt)' }}
              >
                <th
                  scope="row"
                  style={{
                    padding: '10px 12px',
                    fontWeight: 500,
                    color: 'var(--primary)',
                    textAlign: 'left',
                  }}
                >
                  {row.feature}
                </th>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(row.free)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(row.plus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="small" style={{ color: 'var(--muted)', marginTop: 12 }}>
        Prices shown ex-GST. Indian customers are billed an additional 18% GST at checkout.
      </p>
    </section>
  );
}

/**
 * Dedicated ₹49 explainer card. Free users are charged ₹49 per PDF
 * export — this surface tells them exactly what that payment buys
 * before they ever see the checkout modal.
 */
export function MicroPaymentExplainer() {
  return (
    <section
      className="card col-12"
      aria-labelledby="micro-pay-title"
      style={{
        background: 'linear-gradient(180deg, #fff7e6 0%, #ffffff 100%)',
        borderLeft: '4px solid var(--warning)',
      }}
    >
      <h2 id="micro-pay-title" style={{ marginTop: 0, color: 'var(--primary)' }}>
        What does <span style={{ color: 'var(--warning)' }}>₹49</span> get you?
      </h2>
      <p className="small" style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 12 }}>
        Don't want a monthly plan? Free users can pay <strong>₹49 per export</strong>{' '}
        whenever they need a finished PDF — no subscription, no auto-renewal.
      </p>

      <ul style={{ margin: '8px 0 12px', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {[
          {
            label: 'One ATS-optimized PDF download',
            details:
              'High-resolution, ATS-safe layout. Works for the resume you just edited.',
          },
          {
            label: 'Word (.docx) export of the same resume',
            details: 'Same content, recruiter-friendly editable format.',
          },
          {
            label: 'Final ATS scan on that version',
            details: 'Confirms the score before the download token unlocks.',
          },
          {
            label: '15-minute download window',
            details:
              'A secure token is issued after payment. Re-downloads inside 15 minutes are free.',
          },
          {
            label: 'GST invoice on email',
            details:
              'For Indian payments via Razorpay — UPI, cards, netbanking, and wallets all accepted.',
          },
        ].map((b) => (
          <li key={b.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span aria-hidden="true" style={{ color: 'var(--warning)', fontWeight: 700, lineHeight: 1.4 }}>
              ✓
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>
              <strong style={{ color: 'var(--primary)' }}>{b.label}</strong>
              <span className="small" style={{ color: 'var(--muted)' }}> — {b.details}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="small" style={{ color: 'var(--muted)', marginTop: 8 }}>
        Want AI everywhere without managing your own key? <strong>CallbackCV Plus at ₹499/mo</strong>{' '}
        unlocks our AI across every feature — AI critique, JD match, Mentor Mode, and more.
        Prefer free? Add your own AI key in Settings and every AI feature is free. Downloads
        stay ₹49 each on any plan.
      </p>
    </section>
  );
}
