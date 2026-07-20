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
    <section className="card" style={{ marginTop: 18 }} aria-labelledby="jd-quickstart-heading">
      <h2 id="jd-quickstart-heading" style={{ marginBottom: 4 }}>Have a job description? Start there.</h2>
      <p className="small" style={{ margin: '0 0 10px', color: 'var(--muted)' }}>
        Paste the JD and we&rsquo;ll show which keywords your resume covers, which it misses,
        and the bullets that would close the gap.
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
        Match my resume to this job
      </button>
    </section>
  );
}
