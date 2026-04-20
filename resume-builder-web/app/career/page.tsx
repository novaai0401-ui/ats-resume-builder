'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TkxAlert,
  TkxButton,
  TkxCard,
  TkxCardBody,
  TkxCardHeader,
  TkxSkeleton,
} from 'tekivex-ui';
import { api } from '@/src/lib/api';

/**
 * Quantum Career Navigator.
 *
 * Client-side only page — picks an industry/role, collects skills the user
 * already has, and calls `/quantum/recommend` to show probability-ranked
 * next-skill suggestions plus cross-industry pivot options. Uses Tekivex
 * primitives so the look matches the rest of the app and we don't have to
 * hand-style another card system.
 */
export default function CareerNavigatorPage() {
  const [loading, setLoading] = useState(true);
  const [industries, setIndustries] = useState<
    Array<{
      id: string;
      label: string;
      tagline: string;
      roles: Array<{ id: string; title: string; seniority: string[] }>;
    }>
  >([]);
  const [industryId, setIndustryId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [targetIndustryId, setTargetIndustryId] = useState('');
  const [targetRoleId, setTargetRoleId] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.recommendQuantum>> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getQuantumIndustries();
        setIndustries(data.items);
        if (data.items.length > 0) {
          setIndustryId(data.items[0].id);
          setRoleId(data.items[0].roles[0]?.id ?? '');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load industry catalog.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentIndustry = useMemo(
    () => industries.find((i) => i.id === industryId),
    [industries, industryId]
  );
  const targetIndustry = useMemo(
    () => (targetIndustryId ? industries.find((i) => i.id === targetIndustryId) : undefined),
    [industries, targetIndustryId]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!industryId || !roleId) return;
    setSubmitting(true);
    setError(null);
    try {
      const skills = skillsInput
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload: Parameters<typeof api.recommendQuantum>[0] = {
        industryId,
        roleId,
        currentSkills: skills,
        limit: 8,
      };
      if (targetIndustryId) payload.targetIndustryId = targetIndustryId;
      if (targetRoleId) payload.targetRoleId = targetRoleId;
      const res = await api.recommendQuantum(payload);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quantum recommendation failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="career-page">
        <section className="hero">
          <h1>Quantum Career Navigator</h1>
          <p className="small">Loading supported industries…</p>
        </section>
        <TkxSkeleton height={240} />
      </main>
    );
  }

  return (
    <main className="career-page">
      <section className="hero">
        <h1>Quantum Career Navigator</h1>
        <p className="small">
          Tell us your industry, current skills, and (optionally) a role you want to pivot into.
          Our quantum-inspired engine ranks what to learn next using superposition &amp; interference
          across related skill clusters.
        </p>
      </section>

      {error ? (
        <TkxAlert variant="danger" style={{ marginBottom: 16 }}>
          {error}
        </TkxAlert>
      ) : null}

      <form onSubmit={onSubmit} className="grid">
        <TkxCard className="col-12" padding="md">
          <TkxCardHeader>
            <h3 style={{ margin: 0 }}>Your current profile</h3>
          </TkxCardHeader>
          <TkxCardBody>
            <div className="grid">
              <label className="col-6">
                <span className="small">Industry</span>
                <select
                  value={industryId}
                  onChange={(e) => {
                    setIndustryId(e.target.value);
                    const next = industries.find((i) => i.id === e.target.value);
                    setRoleId(next?.roles[0]?.id ?? '');
                  }}
                >
                  {industries.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-6">
                <span className="small">Role</span>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {(currentIndustry?.roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-12">
                <span className="small">Skills you already have (comma or newline separated)</span>
                <textarea
                  rows={3}
                  placeholder="e.g. HTML, CSS, JavaScript, Active Listening, Patient Care"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                />
              </label>
            </div>
          </TkxCardBody>
        </TkxCard>

        <TkxCard className="col-12" padding="md">
          <TkxCardHeader>
            <h3 style={{ margin: 0 }}>Where do you want to go? (optional)</h3>
          </TkxCardHeader>
          <TkxCardBody>
            <div className="grid">
              <label className="col-6">
                <span className="small">Target industry</span>
                <select
                  value={targetIndustryId}
                  onChange={(e) => {
                    setTargetIndustryId(e.target.value);
                    setTargetRoleId('');
                  }}
                >
                  <option value="">— same as current —</option>
                  {industries.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-6">
                <span className="small">Target role</span>
                <select
                  value={targetRoleId}
                  onChange={(e) => setTargetRoleId(e.target.value)}
                  disabled={!targetIndustryId}
                >
                  <option value="">— same as current —</option>
                  {(targetIndustry?.roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </TkxCardBody>
        </TkxCard>

        <div className="col-12" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <TkxButton type="submit" isLoading={submitting} disabled={!industryId || !roleId}>
            {submitting ? 'Running quantum engine…' : 'Recommend next skills'}
          </TkxButton>
          <Link href="/pricing" className="btn secondary">
            See subscription tiers
          </Link>
        </div>
      </form>

      {result ? (
        <section style={{ marginTop: 24 }}>
          <TkxCard padding="md">
            <TkxCardHeader>
              <h3 style={{ margin: 0 }}>Quantum recommendations</h3>
              <p className="small" style={{ margin: 0 }}>
                Current: {result.role}
                {result.targetRole ? ` → target: ${result.targetRole}` : ''}
                {result.targetIndustry ? ` (${result.targetIndustry})` : ''}
              </p>
            </TkxCardHeader>
            <TkxCardBody>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                <strong>Role readiness:</strong>
                <span
                  className="badge"
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: readinessColor(result.readiness),
                    color: '#fff',
                  }}
                >
                  {Math.round(result.readiness * 100)}%
                </span>
              </div>
              <ol className="quantum-recs">
                {result.recommendations.map((r) => (
                  <li key={r.skill}>
                    <div>
                      <strong>{r.skill}</strong>{' '}
                      <span className="small">
                        ({Math.round(r.probability * 100)}% weight{r.cluster ? ` · ${r.cluster}` : ''})
                      </span>
                    </div>
                    <p className="small" style={{ margin: 0 }}>{r.reason}</p>
                  </li>
                ))}
              </ol>
            </TkxCardBody>
          </TkxCard>

          {result.pivots.length > 0 ? (
            <TkxCard padding="md" style={{ marginTop: 16 }}>
              <TkxCardHeader>
                <h3 style={{ margin: 0 }}>Cross-industry pivots</h3>
                <p className="small" style={{ margin: 0 }}>
                  Industries your skill profile already overlaps with.
                </p>
              </TkxCardHeader>
              <TkxCardBody>
                <ul className="quantum-pivots">
                  {result.pivots.map((p) => (
                    <li key={p.industryId}>
                      <strong>{p.label}</strong>{' '}
                      <span className="small">
                        overlap {Math.round(p.alignment * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </TkxCardBody>
            </TkxCard>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function readinessColor(readiness: number): string {
  if (readiness >= 0.75) return '#1f7a3a';
  if (readiness >= 0.4) return '#8a6d1f';
  return '#8f2f2f';
}
