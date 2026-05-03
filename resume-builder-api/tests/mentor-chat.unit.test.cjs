const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildSystemPrompt,
  sanitizeHistory,
  serializeChatHistory,
} = require('../dist/ai/mentor-chat.service.js');

// ─────────────────────────────────────────────────────────────────────
// Pure-logic tests for the Mentor Chat service. The DI'd `chat`
// method needs Prisma + Settings + an AI provider; these pin the
// helpers that don't.
// ─────────────────────────────────────────────────────────────────────

test('sanitizeHistory keeps only valid role+content pairs', () => {
  const out = sanitizeHistory([
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' },
    { role: 'system', content: 'noop' }, // dropped — bad role
    { role: 'user', content: '   ' },     // dropped — empty
    { role: 'user' },                       // dropped — missing content
    null,
    'not an object',
    { role: 'user', content: 'Real Q' },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((m) => m.role), ['user', 'assistant', 'user']);
});

test('sanitizeHistory caps history at MAX_HISTORY (last 20 turns)', () => {
  const big = Array.from({ length: 50 }, (_, i) => ({ role: 'user', content: `q${i}` }));
  const out = sanitizeHistory(big);
  assert.equal(out.length, 20);
  // We keep the most recent 20.
  assert.equal(out[0].content, 'q30');
  assert.equal(out[19].content, 'q49');
});

test('sanitizeHistory trims whitespace inside content', () => {
  const out = sanitizeHistory([{ role: 'user', content: '  spaced out  ' }]);
  assert.equal(out[0].content, 'spaced out');
});

test('sanitizeHistory returns [] for non-array input', () => {
  assert.deepEqual(sanitizeHistory([]), []);
  assert.deepEqual(sanitizeHistory([null, undefined, 0]), []);
});

test('buildSystemPrompt always includes the mentor persona + core rules', () => {
  const out = buildSystemPrompt('', []);
  assert.match(out, /senior career mentor/i);
  assert.match(out, /under 200 words/);
  assert.match(out, /never invent achievements/i);
});

test('buildSystemPrompt injects the resume when provided', () => {
  const out = buildSystemPrompt('Frontend Engineer at Acme, built React app.', []);
  assert.match(out, /CANDIDATE/);
  assert.match(out, /Acme/);
});

test('buildSystemPrompt notes the missing resume when blank', () => {
  const out = buildSystemPrompt('', []);
  assert.match(out, /No resume on file/);
});

test('buildSystemPrompt formats job applications with status', () => {
  const out = buildSystemPrompt('resume', [
    { company: 'Stripe', role: 'SWE II', status: 'applied' },
    { company: 'Razorpay', role: 'Senior FE', status: 'interview' },
  ]);
  assert.match(out, /Stripe/);
  assert.match(out, /SWE II/);
  assert.match(out, /interview/);
});

test('serializeChatHistory builds a User/Mentor transcript ending with "Mentor:"', () => {
  const transcript = serializeChatHistory([
    { role: 'user', content: 'Should I learn Rust?' },
    { role: 'assistant', content: 'Depends on your goals.' },
    { role: 'user', content: 'For a backend role.' },
  ]);
  // Matches the open-prompt convention so the LLM continues as the mentor.
  assert.ok(transcript.endsWith('Mentor:'));
  assert.match(transcript, /User: Should I learn Rust\?/);
  assert.match(transcript, /Mentor: Depends on your goals/);
});

test('serializeChatHistory returns just the open prompt for an empty history', () => {
  const out = serializeChatHistory([]);
  assert.equal(out.trim(), 'Mentor:');
});
