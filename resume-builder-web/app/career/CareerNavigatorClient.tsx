'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TkxButton, TkxCheckbox, TkxSelect, TkxTextarea } from 'tekivex-ui';
import { PROFESSION_INDUSTRIES, getIndustryById, getRoleById } from 'resume-builder-shared';
import { api, type Resume, type TechGapResult } from '@/src/lib/api';
import FreeAiNotice from '@/src/components/FreeAiNotice';
import { buildSkillsPlaceholder, getSkillHintsForIndustry } from '@/src/lib/profession-skill-hints';
import { handleFreeTrialError } from '@/src/lib/free-trial';

type Status = 'idle' | 'analyzing' | 'error';

type ReadinessBreakdown = {
  overall: number;
  technical: number;
  leadership: number;
  domain: number;
};

/**
 * Convert a free-form readiness string (e.g. "82%" / "Strong" / "70/100")
 * into a 0-100 number so we can render bars and the quantum radial.
 */
function parseReadiness(text: string | undefined, fallback = 0): number {
  if (!text) return fallback;
  const pctMatch = text.match(/(\d{1,3})\s*%/);
  if (pctMatch) return Math.max(0, Math.min(100, Number(pctMatch[1])));
  const fractionMatch = text.match(/(\d{1,3})\s*\/\s*(\d{2,3})/);
  if (fractionMatch) {
    const n = Number(fractionMatch[1]);
    const d = Number(fractionMatch[2]) || 100;
    return Math.max(0, Math.min(100, Math.round((n / d) * 100)));
  }
  const lowered = text.toLowerCase();
  if (lowered.includes('strong') || lowered.includes('excellent')) return 85;
  if (lowered.includes('high')) return 80;
  if (lowered.includes('good') || lowered.includes('solid')) return 70;
  if (lowered.includes('moderate') || lowered.includes('partial')) return 55;
  if (lowered.includes('weak') || lowered.includes('low')) return 35;
  return fallback;
}

function readinessBreakdown(result: TechGapResult | null): ReadinessBreakdown {
  if (!result) return { overall: 0, technical: 0, leadership: 0, domain: 0 };
  const r = result.estimatedRoleReadiness;
  const overallRaw = parseReadiness(r?.overall, 0);
  // When the AI falls back to qualitative labels for sub-axes, anchor around the
  // overall number so the bars still feel honest rather than flat-lining at 0.
  const anchor = overallRaw || 0;
  return {
    overall: overallRaw,
    technical: parseReadiness(r?.technical, anchor),
    leadership: parseReadiness(r?.leadership, Math.max(0, anchor - 10)),
    domain: parseReadiness(r?.domain, anchor),
  };
}

function splitSkillsInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export default function CareerNavigatorClient() {
  const [industryId, setIndustryId] = useState<string>('information-technology');
  const [roleId, setRoleId] = useState<string>('');
  const [targetIndustryId, setTargetIndustryId] = useState<string>('');
  const [targetRoleId, setTargetRoleId] = useState<string>('');
  const [skillsText, setSkillsText] = useState('');
  const [jdText, setJdText] = useState('');

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [useResume, setUseResume] = useState(false);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TechGapResult | null>(null);

  // Fetch user's saved resumes so the navigator can analyse any of them
  // directly — no need to paste skills or upload again.
  useEffect(() => {
    let cancelled = false;
    api
      .listResumes()
      .then((items) => {
        if (cancelled) return;
        const list = Array.isArray(items) ? items : [];
        setResumes(list);
        // Pre-select the most recently updated resume for convenience.
        if (list.length) {
          const sorted = [...list].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          setSelectedResumeId(sorted[0].id);
        }
      })
      .catch(() => {
        // Non-fatal — user can still analyse by pasting skills.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentIndustry = useMemo(() => getIndustryById(industryId), [industryId]);
  const currentRole = useMemo(
    () => (industryId && roleId ? getRoleById(industryId, roleId) : undefined),
    [industryId, roleId],
  );
  const effectiveTargetIndustryId = targetIndustryId || industryId;
  const targetIndustry = useMemo(
    () => getIndustryById(effectiveTargetIndustryId),
    [effectiveTargetIndustryId],
  );
  const targetRole = useMemo(
    () => (effectiveTargetIndustryId && targetRoleId ? getRoleById(effectiveTargetIndustryId, targetRoleId) : undefined),
    [effectiveTargetIndustryId, targetRoleId],
  );
  const effectiveTargetRole = targetRole || currentRole;
  const readiness = useMemo(() => readinessBreakdown(result), [result]);

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) || null,
    [resumes, selectedResumeId],
  );

  async function handleAnalyze() {
    setError('');
    setStatus('analyzing');
    try {
      const pastedSkills = splitSkillsInput(skillsText);
      const resumeSkills = useResume && selectedResume ? (selectedResume.skills || []) : [];
      const merged = Array.from(new Set([...resumeSkills, ...pastedSkills].map((s) => s.trim()).filter(Boolean)));

      if (!merged.length && !useResume) {
        setError('Add at least one skill, or pick a saved resume to analyse.');
        setStatus('idle');
        return;
      }

      const targetLabel = effectiveTargetRole?.label || currentRole?.label || '';

      const input: Parameters<typeof api.techGap>[0] = {
        skills: merged,
        targetRole: targetLabel,
        jdText: jdText.trim() || undefined,
      };

      if (useResume && selectedResume) {
        input.summary = selectedResume.summary;
        input.experience = (selectedResume.experience || []).map((exp) => ({
          company: exp.company,
          role: exp.role,
          startDate: exp.startDate,
          endDate: exp.endDate,
          highlights: exp.highlights || [],
        }));
        input.education = (selectedResume.education || []).map((edu) => ({
          institution: edu.institution,
          degree: edu.degree,
        }));
        input.certifications = (selectedResume.certifications || []).map((cert) => ({
          name: cert.name,
        }));
      }

      const analysis = await api.techGap(input);
      setResult(analysis);
      setStatus('idle');
    } catch (err: unknown) {
      // R-098 — a spent free run opens the app-wide popup, not an inline error.
      if (handleFreeTrialError(err)) {
        setStatus('idle');
        return;
      }
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      setStatus('error');
    }
  }

  function resetResults() {
    setResult(null);
    setError('');
  }

  return (
    <main className="grid">
      <section className="card col-12">
        <h1 style={{ margin: '0 0 4px' }}>Quantum Career Navigator</h1>
        <p className="small" style={{ marginTop: 0, maxWidth: 760 }}>
          Pick your industry, current role, and target role. Our quantum-inspired engine
          ranks the next skills to learn by weighing overlap between your resume and
          what the target role actually demands.
        </p>
      </section>

      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Your current profile</h2>
        <div className="grid" style={{ gap: 12 }}>
          <div className="col-6">
            <TkxSelect
              label="Industry"
              searchable
              value={industryId}
              options={PROFESSION_INDUSTRIES.map((industry) => ({
                value: industry.id,
                label: industry.label,
              }))}
              onChange={(value) => {
                setIndustryId(String(value || ''));
                setRoleId('');
                resetResults();
              }}
            />
          </div>
          <div className="col-6">
            <TkxSelect
              label="Role"
              searchable
              clearable
              value={roleId || undefined}
              placeholder="Select a role"
              options={(currentIndustry?.roles || []).map((role) => ({
                value: role.id,
                label: role.label,
              }))}
              onChange={(value) => {
                setRoleId(String(value || ''));
                resetResults();
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <TkxTextarea
            label="Skills you already have (comma or newline separated)"
            minRows={4}
            placeholder={buildSkillsPlaceholder(industryId)}
            value={skillsText}
            onChange={(event) => setSkillsText(event.target.value)}
          />
          {/*
            Profession-keyed chip row. Tapping a chip appends the skill to
            the textarea so users in non-IT fields don't have to type
            "Patient Assessment" from scratch. Chips are derived from
            profession-skill-hints.ts, so they follow the selected industry.
          */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {getSkillHintsForIndustry(industryId).map((skill) => {
              const alreadyListed = splitSkillsInput(skillsText)
                .map((s) => s.toLowerCase())
                .includes(skill.toLowerCase());
              return (
                <TkxButton
                  key={skill}
                  type="button"
                  variant="ghost"
                  disabled={alreadyListed}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: 999,
                    opacity: alreadyListed ? 0.5 : 1,
                  }}
                  onClick={() => {
                    setSkillsText((prev) => {
                      const trimmed = prev.trim();
                      if (!trimmed) return skill;
                      return `${trimmed}, ${skill}`;
                    });
                  }}
                >
                  + {skill}
                </TkxButton>
              );
            })}
          </div>
        </div>

        {resumes.length > 0 ? (
          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ marginBottom: 8 }}>
              <TkxCheckbox
                checked={useResume}
                onChange={(event) => setUseResume(event.target.checked)}
                label={
                  <span className="small" style={{ fontWeight: 600 }}>
                    Use one of my saved resumes for a deeper analysis
                  </span>
                }
              />
            </div>
            {useResume ? (
              <TkxSelect
                label="Resume"
                searchable
                value={selectedResumeId}
                options={resumes.map((resume) => ({
                  value: resume.id,
                  label: resume.title,
                }))}
                onChange={(value) => setSelectedResumeId(String(value || ''))}
              />
            ) : null}
          </div>
        ) : (
          <p className="small" style={{ marginTop: 12 }}>
            Tip: <Link href="/resume/start">create or upload a resume</Link> to get sharper, resume-aware recommendations.
          </p>
        )}
      </section>

      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Where do you want to go? (optional)</h2>
        <div className="grid" style={{ gap: 12 }}>
          <div className="col-6">
            <TkxSelect
              label="Target industry"
              searchable
              clearable
              value={targetIndustryId || undefined}
              placeholder="— same as current —"
              options={PROFESSION_INDUSTRIES.map((industry) => ({
                value: industry.id,
                label: industry.label,
              }))}
              onChange={(value) => {
                setTargetIndustryId(String(value || ''));
                setTargetRoleId('');
                resetResults();
              }}
            />
          </div>
          <div className="col-6">
            <TkxSelect
              label="Target role"
              searchable
              clearable
              value={targetRoleId || undefined}
              placeholder="— same as current —"
              options={(targetIndustry?.roles || []).map((role) => ({
                value: role.id,
                label: role.label,
              }))}
              onChange={(value) => {
                setTargetRoleId(String(value || ''));
                resetResults();
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <TkxTextarea
            label="Paste a target job description (optional, sharpens analysis)"
            minRows={4}
            placeholder="Paste the JD of the role you want to pivot into..."
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <TkxButton
            type="button"
           
            onClick={handleAnalyze}
            disabled={status === 'analyzing'}
          >
            {status === 'analyzing' ? 'Analyzing...' : 'Recommend next skills'}
          </TkxButton>
          {result ? (
            <TkxButton type="button" variant="ghost" onClick={resetResults}>
              Clear results
            </TkxButton>
          ) : null}
        </div>

        {error ? (
          <p className="small" style={{ color: '#b91c1c', marginTop: 12 }}>
            {error}
          </p>
        ) : null}
      </section>

      {result ? (
        <>
          <FreeAiNotice variant="card" />
          <CareerNavigatorResults
            result={result}
            readiness={readiness}
            currentRoleLabel={currentRole?.label || ''}
            targetRoleLabel={effectiveTargetRole?.label || currentRole?.label || ''}
          />
        </>
      ) : (
        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>Quantum recommendations</h2>
          <p className="small" style={{ margin: 0 }}>
            {currentRole
              ? `Current: ${currentRole.label}`
              : 'Pick a role above, then click "Recommend next skills" to see a role-aware learning plan.'}
          </p>
        </section>
      )}
    </main>
  );
}

// ─── Results panel ─────────────────────────────────────────────────────────

function CareerNavigatorResults({
  result,
  readiness,
  currentRoleLabel,
  targetRoleLabel,
}: {
  result: TechGapResult;
  readiness: ReadinessBreakdown;
  currentRoleLabel: string;
  targetRoleLabel: string;
}) {
  const missingTotal =
    result.missingCriticalSkills.length +
    result.missingSecondarySkills.length +
    result.toolsGap.length;
  const roadmap = result.learningRoadmap || [];

  return (
    <>
      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Quantum recommendations</h2>
        <p className="small" style={{ margin: 0 }}>
          {targetRoleLabel && targetRoleLabel !== currentRoleLabel
            ? `Pivoting from ${currentRoleLabel || 'your current role'} → ${targetRoleLabel}`
            : currentRoleLabel
              ? `Current: ${currentRoleLabel}`
              : ''}
        </p>

        <div className="grid" style={{ gap: 12, marginTop: 12 }}>
          <ReadinessTile label="Role readiness" value={readiness.overall} accent="#1e5b35" />
          <ReadinessTile label="Technical" value={readiness.technical} accent="#2f5f8f" />
          <ReadinessTile label="Leadership" value={readiness.leadership} accent="#8f5a2f" />
          <ReadinessTile label="Domain" value={readiness.domain} accent="#5b358f" />
        </div>

        {result.roleAlignmentSummary ? (
          <p className="small" style={{ marginTop: 12 }}>
            {result.roleAlignmentSummary}
          </p>
        ) : null}
      </section>

      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Skills you already bring</h2>
        {result.strongSkills.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.strongSkills.map((skill) => (
              <span
                key={skill}
                className="pill"
                style={{ background: '#e8f5ec', color: '#1e5b35' }}
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            Add more skills (or a resume) so we can recognise your strengths here.
          </p>
        )}
      </section>

      <section className="card col-12">
        <h2 style={{ marginTop: 0 }}>Skills to learn next</h2>
        <p className="small" style={{ margin: '0 0 12px' }}>
          {missingTotal > 0
            ? `${missingTotal} skill${missingTotal === 1 ? '' : 's'} close the gap to ${targetRoleLabel || 'your target role'}.`
            : 'Your coverage looks good. Consider deepening existing skills or adding leadership signals.'}
        </p>

        <SkillGapBlock
          title="Critical to land the role"
          tone="#b91c1c"
          skills={result.missingCriticalSkills}
        />
        <SkillGapBlock
          title="Nice-to-have to stand out"
          tone="#ca8a04"
          skills={result.missingSecondarySkills}
        />
        <SkillGapBlock title="Tools & platforms" tone="#2f5f8f" skills={result.toolsGap} />
        <SkillGapBlock
          title="Leadership signals"
          tone="#8f5a2f"
          skills={result.leadershipGap}
        />
        <SkillGapBlock
          title="Architecture / design"
          tone="#5b358f"
          skills={result.architectureGap}
        />
      </section>

      {roadmap.length ? (
        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>Learning roadmap</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10 }}>
            {roadmap.map((item, idx) => (
              <li key={`${item.skill}-${idx}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{item.skill}</strong>
                  <span
                    className="pill"
                    style={{
                      background:
                        item.priority === 'high' ? '#fee2e2' : item.priority === 'medium' ? '#fef3c7' : '#e0f2fe',
                      color:
                        item.priority === 'high' ? '#b91c1c' : item.priority === 'medium' ? '#92400e' : '#075985',
                    }}
                  >
                    {item.priority} priority
                  </span>
                </div>
                {item.reason ? (
                  <p className="small" style={{ margin: '4px 0 0' }}>{item.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {result.resumeImprovementSuggestions.length ? (
        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>Resume improvements for this role</h2>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {result.resumeImprovementSuggestions.map((suggestion, idx) => (
              <li key={idx} className="small">{suggestion}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.addOnlyIfTrue.length ? (
        <section className="card col-12">
          <h2 style={{ marginTop: 0 }}>Add only if actually true</h2>
          <p className="small" style={{ margin: '0 0 8px' }}>
            These signals might be present in your experience but weren't explicit.
            Add them to your resume only if you genuinely did them — never fabricate.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.addOnlyIfTrue.map((signal) => (
              <span
                key={signal}
                className="pill"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                {signal}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ReadinessTile({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="col-3" style={{ minWidth: 160 }}>
      <p className="small" style={{ margin: '0 0 4px', fontWeight: 600 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          className="pill"
          style={{ background: pct > 70 ? '#e8f5ec' : pct > 40 ? '#fef3c7' : '#fee2e2', color: accent, fontWeight: 700 }}
        >
          {pct}%
        </span>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: accent,
              borderRadius: 4,
              transition: 'width 0.4s',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SkillGapBlock({ title, tone, skills }: { title: string; tone: string; skills: string[] }) {
  if (!skills.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p className="small" style={{ margin: '0 0 6px', fontWeight: 600, color: tone }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {skills.map((skill) => (
          <span key={skill} className="pill" style={{ borderColor: tone }}>
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}
