'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * R-090 — home-page "Paste a JD" quick start. The critique found the core
 * job-hunter task ("I have a JD → does my resume match?") took 6+
 * undiscoverable clicks. This puts the entry point on the front door: the
 * pasted JD is stashed locally and /jd-match picks it up on mount
 * (rb_pending_jd), so the user lands mid-task instead of at a blank form.
 */
export const PENDING_JD_KEY = 'rb_pending_jd';

export default function JdQuickStart() {
  const router = useRouter();
  const [jd, setJd] = useState('');

  const go = () => {
    const text = jd.trim();
    if (text) {
      try {
        window.localStorage.setItem(PENDING_JD_KEY, text.slice(0, 20000));
      } catch {
        // storage unavailable (private mode) — still navigate; the user
        // can paste again on the match page.
      }
    }
    router.push('/jd-match');
  };

  return (
    <section
      className="card"
      style={{ marginTop: 18, borderLeft: '4px solid var(--primary)' }}
      aria-labelledby="jd-quickstart-heading"
      data-testid="jd-quick-start"
    >
      <h2 id="jd-quickstart-heading" style={{ marginBottom: 4 }}>
        Which skills is your resume missing for this job?
      </h2>
      <p className="small" style={{ margin: '0 0 10px', color: 'var(--muted)' }}>
        Paste the job description. We compare it against your resume and show the skills you
        already cover, the ones this job wants that you don&rsquo;t show — each with a one-tap
        <strong> + Add</strong> button — and the bullets that would close the gap.
      </p>
      <textarea
        className="input"
        rows={4}
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the job description here…"
        aria-label="Job description"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <button className="btn" type="button" onClick={go} disabled={!jd.trim()} style={{ marginTop: 10 }}>
        Show my missing skills
      </button>
      <p className="small" style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
        Free for your first run — every AI feature here is free once.
      </p>
    </section>
  );
}
