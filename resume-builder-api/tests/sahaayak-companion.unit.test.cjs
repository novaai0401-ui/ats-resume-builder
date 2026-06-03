const assert = require('node:assert/strict');
const test = require('node:test');
const {
  detectSentiment,
  companionReply,
} = require('../dist/sahaayak/companion-fallback.js');

// The offline companion is what users actually see when no LLM key is
// configured. The old fallback echoed the user's words verbatim every
// turn ("I'm listening. You said '<x>'..."). These tests pin down the
// new behaviour: sentiment-aware, varied, never a robotic echo.

// --------------------------------------------------------------------
// detectSentiment
// --------------------------------------------------------------------

test('detects positive sentiment from happy / good-news words', () => {
  assert.equal(detectSentiment('I am so happy today'), 'positive');
  assert.equal(detectSentiment('I finally got the job offer!'), 'positive');
  assert.equal(detectSentiment('cleared the interview, feeling proud'), 'positive');
});

test('detects down sentiment from sadness / rejection words', () => {
  assert.equal(detectSentiment('I got another rejection today'), 'down');
  assert.equal(detectSentiment('I feel so alone and tired'), 'down');
  assert.equal(detectSentiment('I want to give up, no point anymore'), 'down');
});

test('detects anxious sentiment from worry words', () => {
  assert.equal(detectSentiment('I am so anxious about the result'), 'anxious');
  assert.equal(detectSentiment("I can't sleep, too much pressure"), 'anxious');
  assert.equal(detectSentiment('what if I never find a job, I am scared'), 'anxious');
});

test('neutral when no emotional markers present', () => {
  assert.equal(detectSentiment('I updated my resume and applied to three roles'), 'neutral');
  assert.equal(detectSentiment(''), 'neutral');
});

test('down feelings take precedence over a mixed positive+down message', () => {
  // "happy" and "rejected" both present — the heavier emotion wins so
  // we never respond cheerfully to someone who is hurting.
  assert.equal(detectSentiment('I was happy but then I got rejected'), 'down');
});

// --------------------------------------------------------------------
// companionReply — never an echo, sentiment-appropriate, varied
// --------------------------------------------------------------------

test('reply never echoes the user text back verbatim', () => {
  const userText = 'I got a job interview';
  const reply = companionReply({ userText, seed: 0 });
  assert.ok(!reply.includes(userText), 'reply must not quote the user verbatim');
  assert.ok(!reply.startsWith("I'm listening. You said"), 'old robotic echo must be gone');
});

test('positive message gets a warm, lifting response', () => {
  const reply = companionReply({ userText: 'I am so happy today', seed: 1 });
  assert.ok(reply.length > 0);
  // Should be from the positive pool — ends with a question.
  assert.match(reply, /\?$/);
});

test('down message gets a supportive, present response (not toxic positivity)', () => {
  const reply = companionReply({ userText: 'I got rejected again and feel hopeless', seed: 2 });
  // Forbidden empty-validation phrases must NOT appear.
  assert.doesNotMatch(reply, /you're amazing|you've got this|stay positive/i);
  assert.ok(reply.length > 0);
});

test('consecutive turns (different seeds) produce different replies', () => {
  const a = companionReply({ userText: 'I feel down', seed: 0 });
  const b = companionReply({ userText: 'I feel down', seed: 1 });
  const c = companionReply({ userText: 'I feel down', seed: 2 });
  assert.notEqual(a, b, 'turn 0 and 1 should differ');
  assert.notEqual(b, c, 'turn 1 and 2 should differ');
});

test('crisis flag returns a steady present line and never an echo', () => {
  const reply = companionReply({ userText: 'I cannot go on', seed: 0, crisis: true });
  assert.ok(reply.length > 0);
  assert.ok(!reply.includes('I cannot go on'));
  assert.doesNotMatch(reply, /You said/);
});

test('karmayoga mode adds a gentle Gita-grounded aside on even turns, no Sanskrit', () => {
  // seed 0 (even) for a down message should append the karmayoga aside.
  const reply = companionReply({ userText: 'I got rejected and feel low', mode: 'karmayoga', seed: 0 });
  // The aside text mentions effort / showing-up; never Sanskrit script.
  assert.doesNotMatch(reply, /[ऀ-ॿ]/, 'must not contain Devanagari/Sanskrit');
  assert.ok(reply.length > 0);
});

test('witness mode never appends a karmayoga aside', () => {
  // Compare witness vs karmayoga at the same seed — witness must be the
  // bare reflection (a prefix of, or different from, the karmayoga one).
  const witness = companionReply({ userText: 'I got rejected and feel low', mode: 'witness', seed: 0 });
  const karma = companionReply({ userText: 'I got rejected and feel low', mode: 'karmayoga', seed: 0 });
  assert.ok(karma.startsWith(witness), 'karmayoga should be witness + aside');
  assert.ok(karma.length > witness.length, 'karmayoga should add the aside');
});

test('handles empty / whitespace input without crashing', () => {
  assert.ok(companionReply({ userText: '', seed: 0 }).length > 0);
  assert.ok(companionReply({ userText: '   ', seed: 5 }).length > 0);
});
