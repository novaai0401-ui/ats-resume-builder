const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseInterviewPrepResponse,
  ruleBasedInterviewQuestions,
} = require('../dist/ai/interview-prep.service.js');

// ─────────────────────────────────────────────────────────────────────
// Pure-logic tests for the Interview Prep service. The DI'd `generate`
// method needs Prisma + Settings; these pin the parser + fallback.
// ─────────────────────────────────────────────────────────────────────

test('parseInterviewPrepResponse parses a clean JSON object', () => {
  const raw = JSON.stringify({
    questions: [
      {
        category: 'behavioral',
        question: 'Walk me through a recent project.',
        whyAsked: 'Tests storytelling.',
        answerOutline: ['Set the scene', 'Your contribution', 'Outcome'],
      },
      {
        category: 'technical',
        question: 'How would you debug a slow endpoint?',
        whyAsked: 'Tests systematic thinking.',
        answerOutline: ['Check dashboards', 'Narrow scope', 'Form hypothesis'],
      },
    ],
  });
  const out = parseInterviewPrepResponse(raw);
  assert.ok(out);
  assert.equal(out.length, 2);
  assert.equal(out[0].category, 'behavioral');
  assert.equal(out[1].answerOutline.length, 3);
});

test('parseInterviewPrepResponse coerces unknown category to behavioral', () => {
  const raw = JSON.stringify({
    questions: [{ category: 'random-tag', question: 'Q?', whyAsked: '', answerOutline: ['a'] }],
  });
  const out = parseInterviewPrepResponse(raw);
  assert.equal(out[0].category, 'behavioral');
});

test('parseInterviewPrepResponse drops malformed entries', () => {
  const raw = JSON.stringify({
    questions: [
      { category: 'technical', question: '', whyAsked: '', answerOutline: ['a'] }, // empty Q
      { category: 'technical', question: 'Q?', whyAsked: '', answerOutline: [] },  // empty outline
      { category: 'technical', question: 'Real Q?', whyAsked: 'why', answerOutline: ['real'] },
    ],
  });
  const out = parseInterviewPrepResponse(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].question, 'Real Q?');
});

test('parseInterviewPrepResponse caps answerOutline at 5 entries', () => {
  const raw = JSON.stringify({
    questions: [{
      category: 'technical',
      question: 'Q',
      whyAsked: 'why',
      answerOutline: ['1', '2', '3', '4', '5', '6', '7'],
    }],
  });
  const out = parseInterviewPrepResponse(raw);
  assert.equal(out[0].answerOutline.length, 5);
});

test('parseInterviewPrepResponse returns null on invalid input', () => {
  assert.equal(parseInterviewPrepResponse(''), null);
  assert.equal(parseInterviewPrepResponse('not json'), null);
  assert.equal(parseInterviewPrepResponse('{ "no_questions_field": true }'), null);
});

test('parseInterviewPrepResponse strips wrapper text around the JSON', () => {
  const raw = 'Here are your questions:\n' + JSON.stringify({
    questions: [{ category: 'behavioral', question: 'Q?', whyAsked: 'w', answerOutline: ['a'] }],
  }) + '\nHope this helps.';
  const out = parseInterviewPrepResponse(raw);
  assert.equal(out.length, 1);
});

test('ruleBasedInterviewQuestions always returns 8 questions', () => {
  const out = ruleBasedInterviewQuestions('Frontend Engineer', 'Some resume text');
  assert.equal(out.length, 8);
});

test('ruleBasedInterviewQuestions covers all three categories', () => {
  const out = ruleBasedInterviewQuestions('Backend', 'short resume');
  const cats = new Set(out.map((q) => q.category));
  assert.ok(cats.has('behavioral'));
  assert.ok(cats.has('technical'));
  assert.ok(cats.has('role-specific'));
});

test('ruleBasedInterviewQuestions has 3+ outline bullets per question', () => {
  const out = ruleBasedInterviewQuestions('Data Engineer', 'Resume content here.');
  for (const q of out) {
    assert.ok(q.answerOutline.length >= 3, `question "${q.question}" has too few outline bullets`);
  }
});

test('ruleBasedInterviewQuestions interpolates the target role into role-specific Qs', () => {
  const out = ruleBasedInterviewQuestions('Senior ML Engineer', 'resume text');
  const roleSpecific = out.filter((q) => q.category === 'role-specific');
  assert.ok(roleSpecific.length >= 1);
  assert.ok(
    roleSpecific.some((q) => q.question.includes('Senior ML Engineer')),
    'expected the target role to appear in at least one role-specific question',
  );
});

test('ruleBasedInterviewQuestions does not crash on empty inputs', () => {
  const out = ruleBasedInterviewQuestions('', '');
  assert.equal(out.length, 8);
  // Falls back to "this role" filler when targetRole is empty.
  assert.ok(out.some((q) => q.question.toLowerCase().includes('this role')));
});
