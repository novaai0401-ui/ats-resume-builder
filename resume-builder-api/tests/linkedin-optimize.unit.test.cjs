const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LinkedInOptimizeService,
  splitProfileSections,
  extractExperienceBullets,
  buildRuleBasedScorecard,
  parseSuggestions,
} = require('../dist/ai/linkedin-optimize.service.js');

/**
 * Pins the LinkedIn Optimizer contract.
 *
 *   - The rule-based baseline ALWAYS runs (no AI, no schema): a strong
 *     profile scores high, a weak one surfaces critical findings.
 *   - Section detection routes Headline / About / Experience / Skills.
 *   - The 15k char cap protects the token budget.
 *   - Honesty: parseSuggestions only keeps grounded fields it can parse.
 */

// Config stub: no GROQ key configured → resolveProvider() returns null,
// so optimize() returns the rule-based baseline without touching the DB.
const configStub = { get: (_key, def) => def };
const prismaStub = { user: { findUnique: async () => null }, aiCritiqueLog: { count: async () => 0, create: async () => ({}) } };

const STRONG_PROFILE = [
  'Senior Backend Engineer | Payments & Distributed Systems | Go, Kubernetes',
  'About',
  "I'm a backend engineer with 8 years building payment platforms. I love turning gnarly",
  'distributed-systems problems into reliable, boring infrastructure that just works.',
  'Experience',
  'Led migration of a monolith to 12 microservices, cutting deploy time by 70%.',
  'Built a fraud-scoring pipeline processing 4M events/day with 99.98% uptime.',
  'Reduced p99 latency from 800ms to 120ms by redesigning the caching layer.',
  'Mentored 5 junior engineers through structured code review.',
  'Skills',
  'Go, Kubernetes, PostgreSQL, Kafka, Terraform, gRPC, Redis, AWS',
].join('\n');

const WEAK_PROFILE = [
  'Person',
  'Experience',
  'Responsible for various tasks.',
  'Worked on stuff.',
].join('\n');

test('section detection routes headline/about/experience/skills', () => {
  const s = splitProfileSections(STRONG_PROFILE);
  assert.match(s.headline, /Senior Backend Engineer/);
  assert.match(s.about, /backend engineer with 8 years/);
  assert.match(s.experience, /Led migration/);
  assert.ok(s.skills.length >= 5, `expected >=5 skills, got ${s.skills.length}`);
  assert.ok(s.skills.includes('Go'));
});

test('extractExperienceBullets pulls bullet-like lines', () => {
  const s = splitProfileSections(STRONG_PROFILE);
  const bullets = extractExperienceBullets(s.experience);
  assert.equal(bullets.length, 4);
});

test('rule-based scorecard has sane shape', () => {
  const result = buildRuleBasedScorecard(splitProfileSections(STRONG_PROFILE));
  assert.equal(result.provider, 'rule-based');
  assert.ok(Number.isFinite(result.overallScore) && result.overallScore >= 0 && result.overallScore <= 100);
  assert.equal(result.sections.length, 4);
  for (const section of result.sections) {
    assert.ok(['Headline', 'About', 'Experience', 'Skills'].includes(section.name));
    assert.ok(section.score >= 0 && section.score <= 100);
    assert.ok(Array.isArray(section.findings) && section.findings.length >= 1);
  }
  assert.ok(['strong', 'decent', 'needs-work'].includes(result.band));
});

test('a strong profile scores higher than a weak one', () => {
  const strong = buildRuleBasedScorecard(splitProfileSections(STRONG_PROFILE));
  const weak = buildRuleBasedScorecard(splitProfileSections(WEAK_PROFILE));
  assert.ok(strong.overallScore > weak.overallScore, `${strong.overallScore} !> ${weak.overallScore}`);
  assert.ok(strong.overallScore >= 70, `strong should be high, got ${strong.overallScore}`);
});

test('a weak profile surfaces critical findings', () => {
  const weak = buildRuleBasedScorecard(splitProfileSections(WEAK_PROFILE));
  const findings = weak.sections.flatMap((s) => s.findings);
  const critical = findings.filter((f) => f.severity === 'critical');
  assert.ok(critical.length >= 1, 'weak profile should surface at least one critical finding');
  // Missing About + missing Skills are the obvious gaps.
  const aboutSection = weak.sections.find((s) => s.name === 'About');
  assert.equal(aboutSection.score, 0);
  const skillsSection = weak.sections.find((s) => s.name === 'Skills');
  assert.equal(skillsSection.score, 0);
});

test('parseSuggestions keeps grounded fields, rejects junk', () => {
  const ok = parseSuggestions('{"suggestedHeadline":"Backend Engineer","suggestedAbout":"I build things.","suggestedSkills":["Go","Kafka"]}');
  assert.equal(ok.suggestedHeadline, 'Backend Engineer');
  assert.equal(ok.suggestedAbout, 'I build things.');
  assert.deepEqual(ok.suggestedSkills, ['Go', 'Kafka']);
  assert.equal(parseSuggestions('not json at all'), null);
  assert.equal(parseSuggestions('{}'), null);
});

test('service returns rule-based baseline when no AI provider configured', async () => {
  const service = new LinkedInOptimizeService(configStub, prismaStub);
  const result = await service.optimize('user-1', { profileText: STRONG_PROFILE });
  assert.equal(result.provider, 'rule-based');
  assert.equal(result.sections.length, 4);
  assert.ok(result.suggestedHeadline === undefined);
});

test('service rejects too-short input', async () => {
  const service = new LinkedInOptimizeService(configStub, prismaStub);
  await assert.rejects(() => service.optimize('user-2', { profileText: 'hi' }));
});

test('service caps input at 15k chars without crashing', async () => {
  const service = new LinkedInOptimizeService(configStub, prismaStub);
  const huge = 'About\n' + 'a'.repeat(60_000);
  const result = await service.optimize('user-3', { profileText: huge });
  assert.equal(result.provider, 'rule-based');
  assert.equal(result.sections.length, 4);
});
