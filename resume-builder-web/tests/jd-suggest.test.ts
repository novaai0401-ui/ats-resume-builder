import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJdKeywords, buildJdSuggestions } from '@/src/lib/jd-suggest';

const MEDICAL_JD = `
Medical Coder (CPC certified preferred)

We are hiring a medical coder for a busy hospital revenue cycle team.
Responsibilities:
- Assign ICD-10 and CPT codes to inpatient and outpatient records.
- Review clinical documentation in the EHR (Epic) for coding accuracy.
- Apply HCPCS codes for supplies and ensure HIPAA compliance.
- Support claims processing and denial follow-up.
Requirements: CPC certification, 2+ years medical coding experience,
strong knowledge of medical terminology and anatomy.
`;

const IT_JD = `
Senior Frontend Engineer

We need a senior engineer to build our customer dashboard.
Requirements:
- Expert in JavaScript, TypeScript, and React.
- Experience with Node.js services, REST APIs, and PostgreSQL.
- Comfortable with Docker, AWS, and CI/CD pipelines.
- Writes unit testing for every feature and works in Agile teams with Git.
`;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

test('extracts medical-coder keywords (ICD-10, CPT, EHR) from a medical JD', () => {
  const { skills, tools, seniority } = extractJdKeywords(MEDICAL_JD);
  const all = [...skills, ...tools].map((k) => k.toLowerCase());
  assert.ok(all.includes('icd-10'), `expected ICD-10 in ${all}`);
  assert.ok(all.includes('cpt'), `expected CPT in ${all}`);
  assert.ok(all.includes('ehr'), `expected EHR in ${all}`);
  assert.ok(all.includes('cpc'), `expected CPC in ${all}`);
  assert.ok(all.includes('hcpcs'), `expected HCPCS in ${all}`);
  assert.equal(typeof seniority, 'string');
});

test('extracts IT keywords and seniority from an IT JD', () => {
  const { skills, tools, seniority } = extractJdKeywords(IT_JD);
  const all = [...skills, ...tools].map((k) => k.toLowerCase());
  assert.ok(all.includes('javascript'), `expected JavaScript in ${all}`);
  assert.ok(all.includes('typescript'), `expected TypeScript in ${all}`);
  assert.ok(all.includes('react'), `expected React in ${all}`);
  assert.ok(all.includes('docker'), `expected Docker in ${all}`);
  assert.ok(tools.map((t) => t.toLowerCase()).includes('react'), 'React is classified as a tool');
  assert.equal(seniority, 'senior');
});

test('suggestedSummary is <= 60 words and contains a matched keyword', () => {
  const resume = {
    summary: 'Detail-oriented coder working in hospital billing.',
    skills: ['ICD-10', 'Medical coding'],
    experience: [
      { role: 'Medical Coder', highlights: ['Coded 120+ charts weekly using ICD-10.'] },
    ],
  };
  const result = buildJdSuggestions(resume, MEDICAL_JD);
  assert.ok(wordCount(result.suggestedSummary) <= 60, `got ${wordCount(result.suggestedSummary)} words`);
  const summaryLower = result.suggestedSummary.toLowerCase();
  const hasMatched = result.matchedKeywords.some((k) => summaryLower.includes(k.toLowerCase()));
  assert.ok(hasMatched, `summary "${result.suggestedSummary}" should weave in a matched keyword`);
  // Plain ASCII only.
  assert.doesNotMatch(result.suggestedSummary, /[^\x20-\x7E]/);
});

test('a keyword present in skills is matched, not missing', () => {
  const withoutSkill = buildJdSuggestions(
    { summary: '', skills: [], experience: [] },
    MEDICAL_JD,
  );
  assert.ok(withoutSkill.missingKeywords.map((k) => k.toLowerCase()).includes('icd-10'));

  const withSkill = buildJdSuggestions(
    { summary: '', skills: ['ICD-10'], experience: [] },
    MEDICAL_JD,
  );
  assert.ok(!withSkill.missingKeywords.map((k) => k.toLowerCase()).includes('icd-10'));
  assert.ok(withSkill.matchedKeywords.map((k) => k.toLowerCase()).includes('icd-10'));
});

test('missing keywords are capped at 8 and bulletIdeas embed a missing keyword', () => {
  const result = buildJdSuggestions({ summary: '', skills: [], experience: [] }, IT_JD);
  assert.ok(result.missingKeywords.length <= 8);
  assert.equal(result.bulletIdeas.length, 3);
  for (const idea of result.bulletIdeas) {
    const embedsKeyword = result.missingKeywords.some((k) => idea.toLowerCase().includes(k.toLowerCase()));
    assert.ok(embedsKeyword, `bullet "${idea}" should embed a missing keyword`);
  }
});
