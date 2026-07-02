const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MockInterviewService,
  sanitizeInterviewHistory,
  buildInterviewerPrompt,
  serializeInterview,
} = require('../dist/ai/mock-interview.service.js');

const config = { get: (_k, def) => def };

function makePrisma(plan) {
  return { user: { findUnique: async () => ({ plan }) } };
}

// ── Helpers ─────────────────────────────────────────────────────────────

test('sanitizeInterviewHistory drops malformed turns and caps history', () => {
  const messy = [
    { role: 'user', content: 'I led the migration.' },
    { role: 'robot', content: 'nope' },
    { role: 'assistant', content: '  Good. Next question…  ' },
    null,
    { role: 'user', content: '' },
  ];
  const out = sanitizeInterviewHistory(messy);
  assert.equal(out.length, 2);
  assert.equal(out[1].content, 'Good. Next question…');
  const long = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `turn ${i}` }));
  assert.equal(sanitizeInterviewHistory(long).length, 24);
});

test('buildInterviewerPrompt grounds in resume + JD and forbids invention', () => {
  const p = buildInterviewerPrompt('RESUME BODY', 'Backend Engineer', 'JD BODY');
  assert.match(p, /MOCK INTERVIEW/);
  assert.match(p, /Backend Engineer/);
  assert.match(p, /CANDIDATE RESUME:\nRESUME BODY/);
  assert.match(p, /TARGET JOB DESCRIPTION:\nJD BODY/);
  assert.match(p, /never invent/i);
});

test('serializeInterview greets on an empty history and prompts the interviewer turn', () => {
  const first = serializeInterview([]);
  assert.match(first, /just sat down/i);
  assert.match(first, /Interviewer:$/);
  const later = serializeInterview([{ role: 'assistant', content: 'Q1?' }, { role: 'user', content: 'A1.' }]);
  assert.match(later, /Interviewer: Q1\?/);
  assert.match(later, /Candidate: A1\./);
  assert.match(later, /Interviewer:$/);
});

// ── Access model ────────────────────────────────────────────────────────

test('free, key-less, plan-less user gets the upsell (no app-key spend)', async () => {
  const svc = new MockInterviewService(makePrisma('FREE'), config);
  const res = await svc.chat('u1', { messages: [] });
  assert.equal(res.provider, 'unavailable');
  assert.match(res.reply, /₹499|AI key/i);
});

test('BYOK user gets an AI interviewer turn (own key, no plan needed)', async () => {
  const svc = new MockInterviewService(makePrisma('FREE'), config);
  // buildByokProvider only accepts known providers; use groq shape but
  // stub the network call by monkey-patching the provider it builds.
  const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');
  const original = GroqProvider.prototype.complete;
  GroqProvider.prototype.complete = async () => 'Tell me about the payments platform you led.';
  try {
    const res = await svc.chat('u1', { messages: [], resumeText: 'Led payments platform.' }, { provider: 'groq', key: 'gsk_test_123456789' });
    assert.equal(res.provider, 'groq');
    assert.match(res.reply, /payments platform/i);
  } finally {
    GroqProvider.prototype.complete = original;
  }
});

test('₹499-plan user without a key runs on OUR AI when configured', async () => {
  const cfg = { get: (k, def) => (k === 'GROQ_API_KEY' ? 'gsk_server_key' : def) };
  const svc = new MockInterviewService(makePrisma('PRO'), cfg);
  const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');
  const original = GroqProvider.prototype.complete;
  GroqProvider.prototype.complete = async () => 'Walk me through your Barclays project.';
  try {
    const res = await svc.chat('u1', { messages: [] });
    assert.equal(res.provider, 'groq');
  } finally {
    GroqProvider.prototype.complete = original;
  }
});
