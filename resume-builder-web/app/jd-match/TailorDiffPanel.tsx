'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/src/lib/api';
import OutcomeInsightCallout from '@/src/components/OutcomeInsightCallout';
import { TkxButton } from 'tekivex-ui';

/**
 * R-034 — Tailor Diff panel.
 *
 * Renders inside the JD Match result. Two states:
 *   1. "Tailor this resume for the JD" call-to-action (idle).
 *   2. Proposal view: per-change accept/reject (summary + bullets +
 *      new skills), then "Apply N changes" → creates a new
 *      ResumeVersion and shows a link to it.
 *
 * Acceptance/rejection is purely client-side until Apply, so the
 * user can pick & choose without burning a second propose call.
 * Stale-proposal rejections from the server are surfaced honestly
 * ("3 of 4 changes applied — the resume was edited mid-proposal,
 * so the stale one was skipped").
 */

type BulletChange = {
  experienceIndex: number;
  bulletIndex: number;
  before: string;
  after: string;
};

type Proposal = {
  summary: { before: string; after: string } | null;
  bullets: BulletChange[];
  skillsToAdd: string[];
};

type Applied = {
  versionId: string;
  versionLabel: string | null;
  appliedBullets: number;
  rejectedAsStale: number;
  appliedToLive: boolean;
};

export default function TailorDiffPanel({
  resumeId,
  jdText,
}: {
  resumeId: string | null;
  jdText: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [acceptSummary, setAcceptSummary] = useState(true);
  const [acceptedBullets, setAcceptedBullets] = useState<Set<number>>(new Set());
  const [acceptedSkills, setAcceptedSkills] = useState<Set<string>>(new Set());
  const [applyToLive, setApplyToLive] = useState(false);
  const [jdCompany, setJdCompany] = useState('');
  const [jdRole, setJdRole] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);

  if (!resumeId) {
    return (
      <section
        className="card col-12"
        style={{ background: 'var(--surface-alt)', borderLeft: '4px solid var(--border)' }}
      >
        <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>
          Save a resume first to use one-click tailoring.{' '}
          <Link href="/resume/start" style={{ color: 'var(--primary)' }}>Start a resume →</Link>
        </p>
      </section>
    );
  }

  const propose = async () => {
    setLoading(true);
    setError(null);
    setApplied(null);
    try {
      const data = await api.tailorPropose(resumeId, jdText);
      setProposal({
        summary: data.summary,
        bullets: data.bullets,
        skillsToAdd: data.skillsToAdd,
      });
      // Default: accept everything (the user is most likely to want
      // all of it; per-item toggles let them prune).
      setAcceptSummary(Boolean(data.summary));
      setAcceptedBullets(new Set(data.bullets.map((_, i) => i)));
      setAcceptedSkills(new Set(data.skillsToAdd));
    } catch (err: any) {
      // Honest error surface — copy the server's message when it's
      // one of our deliberate ones (no GROQ key, plan-gated, etc).
      const msg =
        err?.message ||
        err?.error ||
        'Could not propose a tailored version right now.';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      const bullets = proposal.bullets.filter((_, i) => acceptedBullets.has(i));
      const skillsToAdd = proposal.skillsToAdd.filter((s) => acceptedSkills.has(s));
      const summary = acceptSummary && proposal.summary ? proposal.summary.after : null;
      const data = await api.tailorApply(resumeId, {
        jdCompany: jdCompany.trim() || undefined,
        jdRole: jdRole.trim() || undefined,
        summary,
        bullets,
        skillsToAdd,
        applyToLive,
      });
      setApplied({
        versionId: data.version.id,
        versionLabel: data.version.label,
        appliedBullets: data.appliedBullets,
        rejectedAsStale: data.rejectedAsStale,
        appliedToLive: data.appliedToLive,
      });
      setProposal(null);
    } catch (err: any) {
      const msg = err?.message || err?.error || 'Could not apply the tailored version.';
      setError(String(msg));
    } finally {
      setApplying(false);
    }
  };

  const toggleBullet = (i: number) => {
    setAcceptedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleSkill = (s: string) => {
    setAcceptedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // ── confirmation state ──
  if (applied) {
    return (
      <section
        className="card col-12"
        style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)', borderLeft: '4px solid var(--success)' }}
        role="status"
      >
        <h2 style={{ marginTop: 0, color: 'var(--primary)' }}>Tailored version saved</h2>
        <p className="small" style={{ color: 'var(--muted)', lineHeight: 1.55, marginBottom: 6 }}>
          Created <strong>{applied.versionLabel || 'a tailored version'}</strong>.{' '}
          {applied.appliedBullets} bullet{applied.appliedBullets === 1 ? '' : 's'} applied
          {applied.rejectedAsStale > 0
            ? ` · ${applied.rejectedAsStale} skipped (the resume changed mid-proposal)`
            : ''}
          {applied.appliedToLive ? ' · also written to your live resume.' : '.'}
        </p>
        <p className="small" style={{ color: 'var(--muted)', marginBottom: 12 }}>
          When you apply to this job, attach this version in the Jobs tracker — that's
          how CallbackCV measures which tailoring actually got you replies.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href={`/resume/versions?id=${encodeURIComponent(resumeId)}`}>
            See in version history
          </Link>
          <TkxButton
            type="button"
            variant="ghost"
            onClick={() => {
              setApplied(null);
              setError(null);
            }}
          >
            Tailor another way
          </TkxButton>
        </div>
      </section>
    );
  }

  // ── proposal state ──
  if (proposal) {
    const total =
      (proposal.summary ? 1 : 0) + proposal.bullets.length + proposal.skillsToAdd.length;
    const selected =
      (acceptSummary && proposal.summary ? 1 : 0) +
      acceptedBullets.size +
      acceptedSkills.size;
    return (
      <section
        className="card col-12"
        aria-labelledby="tailor-diff-title"
        style={{ borderLeft: '4px solid var(--primary)' }}
      >
        <h2 id="tailor-diff-title" style={{ marginTop: 0 }}>
          Tailored rewrites — {selected} of {total} selected
        </h2>
        <p className="small" style={{ color: 'var(--muted)', marginTop: -4 }}>
          Pick the changes you want. We'll save them as a NEW version of your resume —
          your live resume stays as it is unless you opt in below.
        </p>

        {proposal.summary ? (
          <div style={blockStyle}>
            <label style={changeHeaderStyle}>
              <input
                type="checkbox"
                checked={acceptSummary}
                onChange={(e) => setAcceptSummary(e.target.checked)}
              />
              <span><strong>Summary rewrite</strong></span>
            </label>
            <DiffRow before={proposal.summary.before} after={proposal.summary.after} />
          </div>
        ) : null}

        {proposal.bullets.length ? (
          <div style={blockStyle}>
            <h3 style={sectionHeadStyle}>
              Bullet rewrites ({acceptedBullets.size}/{proposal.bullets.length})
            </h3>
            {proposal.bullets.map((b, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <label style={changeHeaderStyle}>
                  <input
                    type="checkbox"
                    checked={acceptedBullets.has(i)}
                    onChange={() => toggleBullet(i)}
                  />
                  <span className="small" style={{ color: 'var(--muted)' }}>
                    Experience #{b.experienceIndex + 1}, bullet #{b.bulletIndex + 1}
                  </span>
                </label>
                <DiffRow before={b.before} after={b.after} />
              </div>
            ))}
          </div>
        ) : null}

        {proposal.skillsToAdd.length ? (
          <div style={blockStyle}>
            <h3 style={sectionHeadStyle}>
              New skills to add ({acceptedSkills.size}/{proposal.skillsToAdd.length})
            </h3>
            <p className="small" style={{ color: 'var(--muted)', marginTop: -4 }}>
              Each one is supported by content already in your resume.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {proposal.skillsToAdd.map((s) => (
                <label
                  key={s}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: acceptedSkills.has(s) ? 'var(--surface-alt)' : 'var(--card)',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={acceptedSkills.has(s)}
                    onChange={() => toggleSkill(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ ...blockStyle, background: 'var(--surface-alt)' }}>
          <h3 style={sectionHeadStyle}>Label this version</h3>
          <div className="diff-2col">
            <input
              type="text"
              placeholder="Company (e.g. BigCo)"
              maxLength={60}
              value={jdCompany}
              onChange={(e) => setJdCompany(e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="Role (e.g. Senior Frontend Engineer)"
              maxLength={60}
              value={jdRole}
              onChange={(e) => setJdRole(e.target.value)}
              className="input"
            />
          </div>
          <label
            className="small"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10 }}
          >
            <input
              type="checkbox"
              checked={applyToLive}
              onChange={(e) => setApplyToLive(e.target.checked)}
            />
            Also update my live resume with the accepted changes
            <span style={{ color: 'var(--muted)' }}>(default: keep live as-is)</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <TkxButton
            type="button"
           
            onClick={apply}
            disabled={applying || selected === 0}
          >
            {applying ? 'Saving…' : `Apply ${selected} change${selected === 1 ? '' : 's'}`}
          </TkxButton>
          <TkxButton
            type="button"
            variant="ghost"
            onClick={() => {
              setProposal(null);
              setError(null);
            }}
            disabled={applying}
          >
            Discard
          </TkxButton>
        </div>
        {error ? (
          <p className="hint error" style={{ marginTop: 10 }}>{error}</p>
        ) : null}
      </section>
    );
  }

  // ── idle state ──
  return (
    <>
    <OutcomeInsightCallout resumeId={resumeId} context="tailor" />
    <section
      className="card col-12"
      style={{ background: 'linear-gradient(180deg, var(--surface-alt) 0%, var(--card) 100%)', borderLeft: '4px solid var(--primary)' }}
    >
      <h2 style={{ marginTop: 0 }}>Want this resume tailored for the JD?</h2>
      <p className="small" style={{ color: 'var(--muted)', lineHeight: 1.55 }}>
        One click. AI proposes per-bullet rewrites you can accept or reject. Saved as a
        new resume version — your live resume stays as it is. (~2,500 AI tokens.)
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <TkxButton
          type="button"
         
          onClick={propose}
          disabled={loading || jdText.trim().length < 80}
        >
          {loading ? 'Tailoring…' : 'Tailor my resume for this JD'}
        </TkxButton>
        {jdText.trim().length < 80 ? (
          <span className="small" style={{ alignSelf: 'center', color: 'var(--muted)' }}>
            Paste the full JD above to enable tailoring.
          </span>
        ) : null}
      </div>
      {error ? <p className="hint error" style={{ marginTop: 10 }}>{error}</p> : null}
    </section>
    </>
  );
}

function DiffRow({ before, after }: { before: string; after: string }) {
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      <div style={diffCell('before')}>
        <span style={diffLabelStyle('before')}>BEFORE</span> {before}
      </div>
      <div style={diffCell('after')}>
        <span style={diffLabelStyle('after')}>AFTER</span> {after}
      </div>
    </div>
  );
}

const blockStyle: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  background: 'var(--surface-alt)',
  border: '1px solid var(--border)',
  borderRadius: 10,
};
const sectionHeadStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 14,
  color: 'var(--primary)',
};
const changeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};
function diffCell(kind: 'before' | 'after'): React.CSSProperties {
  return {
    padding: '8px 10px',
    background: kind === 'before' ? '#fff1f2' : '#f0fdf4',
    border: `1px solid ${kind === 'before' ? '#fecdd3' : '#bbf7d0'}`,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.55,
    color: '#1f2937',
  };
}
function diffLabelStyle(kind: 'before' | 'after'): React.CSSProperties {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: kind === 'before' ? '#a8412c' : '#1e7a3a',
    marginRight: 8,
    verticalAlign: 'middle',
  };
}
