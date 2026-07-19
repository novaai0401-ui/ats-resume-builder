import assert from 'node:assert/strict';
import test from 'node:test';
import { isApiRequestError, publicAtsCheck } from '../src/lib/api';

// The anonymous ATS check must never attach an Authorization header
// (there is no account in scope) and must surface the rate-limit
// message so the widget can pair it with the signup CTA.

type FetchCall = { url: string; init: RequestInit };

function installFetchStub(status: number, body: unknown) {
  const calls: FetchCall[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  };
  return calls;
}

test('publicAtsCheck posts anonymously and returns the score payload', async () => {
  const payload = {
    atsScore: 72,
    band: 'promising',
    topIssues: ['Missing Skills section (minimum 3 skills).'],
    missingSections: ['Skills'],
    disclaimer: 'not stored',
  };
  const calls = installFetchStub(200, payload);

  const result = await publicAtsCheck('summary experience education');
  assert.deepEqual(result, payload);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/public\/ats-check$/);
  assert.equal(calls[0].init.method, 'POST');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, undefined, 'anonymous call must not send a token');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { resumeText: 'summary experience education' });
});

test('publicAtsCheck surfaces the 429 rate-limit message as ApiRequestError', async () => {
  const message = 'Free anonymous ATS checks are limited to 3 per day. Create a free account for unlimited ATS checks.';
  installFetchStub(429, { statusCode: 429, message });

  await assert.rejects(
    () => publicAtsCheck('resume text'),
    (err: unknown) => {
      assert.ok(isApiRequestError(err));
      assert.equal(err.status, 429);
      assert.equal(err.message, message);
      return true;
    },
  );
});
