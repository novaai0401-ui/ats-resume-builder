const assert = require('node:assert/strict');
const test = require('node:test');
const { buildRuleBasedPlan, parseAiPlan } = require('../dist/ai/profile-copilot.service.js');

test('an empty resume gets a high-severity plan that names each gap', () => {
  const { assessment, actions } = buildRuleBasedPlan({});
  const ids = actions.map((a) => a.id);
  assert.ok(ids.includes('summary-missing'));
  assert.ok(ids.includes('experience-missing'));
  assert.ok(ids.includes('skills-thin'));
  // highs first, capped
  assert.equal(actions[0].severity, 'high');
  assert.ok(actions.length <= 6);
  assert.match(assessment, /high-impact/);
  // every action carries a route the UI can deep-link
  for (const a of actions) assert.ok(a.cta.startsWith('/'), a.id);
});

test('rules state checkable facts about THIS resume, not generic advice', () => {
  const { actions } = buildRuleBasedPlan({
    summary: 'Experienced leader driving outcomes.',
    experience: [
      { role: 'AVP', highlights: ['Led reviews', 'Improved delivery', 'Ran syncs', 'Shipped a lot', 'Owned quality'] },
    ],
    skills: ['React', 'TS', 'Node', 'CSS', 'HTML', 'Git', 'Jest', 'AWS'],
    education: [{ degree: 'BE' }],
    achievements: ['Won award'],
  });
  const bullets = actions.find((a) => a.id === 'bullets-no-metrics');
  assert.ok(bullets, 'numberless bullets must be flagged');
  // The title carries the actual count — the user can verify by looking.
  assert.match(bullets.title, /5 of 5/);
  const summary = actions.find((a) => a.id === 'summary-no-numbers');
  assert.ok(summary, 'numberless summary must be flagged');
});

test('a complete resume gets a calm assessment, not manufactured urgency', () => {
  const { assessment, actions } = buildRuleBasedPlan({
    summary: 'Led a 9-person team to 25% faster releases.',
    experience: [{ role: 'AVP', company: 'Citi', highlights: ['Cut release time 25%', 'Mentored 10 engineers'] }],
    skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    education: [{ degree: 'BE' }],
    achievements: ['Rising Star award'],
  });
  assert.equal(actions.filter((a) => a.severity === 'high').length, 0);
  assert.match(assessment, /Solid foundation|refinements/);
});

test('parseAiPlan keeps our CTAs — the model has no routing knowledge', () => {
  const draft = [
    { id: 'summary-missing', severity: 'high', section: 'summary', title: 't', detail: 'd', cta: '/resume?section=summary' },
  ];
  const parsed = parseAiPlan(
    JSON.stringify({
      assessment: 'Sharp resume held back by an empty summary.',
      actions: [
        { id: 'summary-missing', severity: 'high', section: 'summary', title: 'Write the summary', detail: 'Yours is empty.' },
        { id: 'ai-1', severity: 'medium', section: 'experience', title: 'Merge roles', detail: 'Two entries overlap.', cta: 'https://evil.example' },
      ],
    }),
    draft,
  );
  assert.ok(parsed);
  assert.equal(parsed.actions[0].cta, '/resume?section=summary');
  // AI-invented ctas are discarded; ours are derived from the section.
  assert.equal(parsed.actions[1].cta, '/resume?section=experience');
});

test('parseAiPlan rejects garbage rather than rendering it', () => {
  const draft = [];
  assert.equal(parseAiPlan('not json at all', draft), null);
  assert.equal(parseAiPlan('{"assessment":"", "actions":[]}', draft), null);
  assert.equal(parseAiPlan('{"assessment":"x","actions":[{"id":"a"}]}', draft), null);
});
