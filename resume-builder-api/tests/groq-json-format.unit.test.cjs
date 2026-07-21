const assert = require('node:assert/strict');
const test = require('node:test');
const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');

// ─────────────────────────────────────────────────────────────────────
// Pins the response_format contract. Groq returns HTTP 400 when
// `response_format: json_object` is set but the prompt never mentions
// "json" — which is the case for conversational endpoints (Mentor, mock
// interview). Those pass { json: false } and MUST NOT send response_format;
// structured callers get JSON by default. Regressing this made every
// Mentor turn fail with "the AI service had a hiccup".
// ─────────────────────────────────────────────────────────────────────

function stubFetch(captured) {
  return async (_url, init) => {
    captured.body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      },
      async text() {
        return 'ok';
      },
    };
  };
}

test('defaults to JSON object response_format (structured callers)', async () => {
  const captured = {};
  const realFetch = global.fetch;
  global.fetch = stubFetch(captured);
  try {
    const provider = new GroqProvider('test-key');
    await provider.complete('system', 'user');
    assert.deepEqual(captured.body.response_format, { type: 'json_object' });
  } finally {
    global.fetch = realFetch;
  }
});

test('json: false omits response_format (conversational callers)', async () => {
  const captured = {};
  const realFetch = global.fetch;
  global.fetch = stubFetch(captured);
  try {
    const provider = new GroqProvider('test-key');
    await provider.complete('system', 'user', { json: false });
    assert.equal('response_format' in captured.body, false);
  } finally {
    global.fetch = realFetch;
  }
});

test('json: true is equivalent to the default', async () => {
  const captured = {};
  const realFetch = global.fetch;
  global.fetch = stubFetch(captured);
  try {
    const provider = new GroqProvider('test-key');
    await provider.complete('system', 'user', { json: true });
    assert.deepEqual(captured.body.response_format, { type: 'json_object' });
  } finally {
    global.fetch = realFetch;
  }
});
