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
 *  STUDENT 40k / 50 / 25 / 10 @ ₹199/mo;
 *  PRO 120k / 300 / 200 / 100 @ ₹499/mo)
 * Keep this file in sync if those limits ever move.
 */

type Row = {
  feature: string;
  free: string | boolean;
  student: string | boolean;
  pro: string | boolean;
};

const ROWS: Row[] = [
  // Quotas
  { feature: 'Saved resumes', free: '2', student: '10', pro: '100' },
  { feature: 'ATS scans / month', free: '2', student: '50', pro: '300' },
  { feature: 'PDF + Word exports / month', free: '5 (₹49 each)', student: '25 (included)', pro: '200 (included)' },
  { feature: 'AI tokens / month', free: '8,000', student: '40,000', pro: '120,000' },

  // Core
  { feature: 'Resume editor & ATS-safe templates', free: true, student: true, pro: true },
  { feature: 'Rule-based ATS scoring', free: true, student: true, pro: true },
  { feature: 'Action-verb + bullet-length checks', free: true, student: true, pro: true },
  { feature: 'Job tracker (Kanban)', free: true, student: true, pro: true },
  { feature: 'Version history (up to 25 per resume)', free: true, student: true, pro: true },
  { feature: 'Bring-your-own AI key (BYOK)', free: true, student: true, pro: true },

  // Paid AI
  { feature: 'AI Resume Critique (LLM rewrites)', free: false, student: true, pro: true },
  { feature: 'AI Bullet Rewriter (✨ one-tap)', free: false, student: true, pro: true },
  { feature: 'JD Match Score + missing keywords', free: false, student: true, pro: true },
  { feature: 'Tech Gap Analysis', free: false, student: true, pro: true },
  { feature: 'Cover Letter Studio', free: false, student: true, pro: true },
  { feature: 'Mentor Mode (career insights)', free: false, student: true, pro: true },
  { feature: 'Outcome Loop (response / interview / offer tracking)', free: true, student: true, pro: true },

  // Pro-only
  { feature: 'Mentor Chat (resume-aware)', free: false, student: false, pro: true },
  { feature: 'Interview Prep Cards (8 per role)', free: false, student: false, pro: true },
  { feature: 'Salary band hints (25/50/75 percentile)', free: false, student: false, pro: true },
  { feature: 'Priority AI queue (skip rate-limits)', free: false, student: false, pro: true },
  { feature: 'Priority support (24h SLA + Slack)', free: false, student: false, pro: true },
  { feature: 'Email support (48h SLA)', free: false, student: true, pro: true },
];

function cell(value: string | boolean): React.ReactNode {
  if (value === true) {
    return (
      <span aria-label="Included" style={{ color: '#1e7a3a', fontWeight: 700 }}>
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span aria-label="Not included" style={{ color: '#94a3b8' }}>
        —
      </span>
    );
  }
  return <span style={{ color: '#1a3a5c' }}>{value}</span>;
}

export default function PlanFeatureComparison() {
  return (
    <section className="card col-12" aria-labelledby="plan-compare-title">
      <h2 id="plan-compare-title" style={{ marginTop: 0 }}>
        Free vs Paid — what changes
      </h2>
      <p className="small" style={{ color: '#5a6778', marginTop: 4, marginBottom: 12 }}>
        Everything in the Free tier stays free forever. Paid tiers unlock the AI
        features and lift the monthly quotas.
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
            <tr style={{ background: '#f3f6fa', textAlign: 'left' }}>
              <th
                scope="col"
                style={{ padding: '10px 12px', borderBottom: '1px solid #d0dbe7', width: '46%' }}
              >
                Feature
              </th>
              <th
                scope="col"
                style={{ padding: '10px 12px', borderBottom: '1px solid #d0dbe7', textAlign: 'center' }}
              >
                Free
              </th>
              <th
                scope="col"
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #d0dbe7',
                  textAlign: 'center',
                  color: '#1a3a5c',
                }}
              >
                Student
                <span className="small" style={{ display: 'block', fontWeight: 400, color: '#5a6778' }}>
                  ₹199/mo
                </span>
              </th>
              <th
                scope="col"
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #d0dbe7',
                  textAlign: 'center',
                  color: '#1a3a5c',
                }}
              >
                Pro
                <span className="small" style={{ display: 'block', fontWeight: 400, color: '#5a6778' }}>
                  ₹499/mo
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.feature}
                style={{ background: i % 2 === 0 ? '#ffffff' : '#fafcfe' }}
              >
                <th
                  scope="row"
                  style={{
                    padding: '10px 12px',
                    fontWeight: 500,
                    color: '#1a3a5c',
                    textAlign: 'left',
                  }}
                >
                  {row.feature}
                </th>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(row.free)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(row.student)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{cell(row.pro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="small" style={{ color: '#5a6778', marginTop: 12 }}>
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
        borderLeft: '4px solid #d68900',
      }}
    >
      <h2 id="micro-pay-title" style={{ marginTop: 0, color: '#1a3a5c' }}>
        What does <span style={{ color: '#d68900' }}>₹49</span> get you?
      </h2>
      <p className="small" style={{ color: '#5a6778', marginTop: 4, marginBottom: 12 }}>
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
            <span aria-hidden="true" style={{ color: '#d68900', fontWeight: 700, lineHeight: 1.4 }}>
              ✓
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>
              <strong style={{ color: '#1a3a5c' }}>{b.label}</strong>
              <span className="small" style={{ color: '#5a6778' }}> — {b.details}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="small" style={{ color: '#5a6778', marginTop: 8 }}>
        Need more than one or two exports a month? The <strong>Student plan at ₹199/mo</strong>{' '}
        already includes 25 exports and unlocks the AI critique, JD match, and Mentor Mode —
        breaks even at 5 downloads.
      </p>
    </section>
  );
}
