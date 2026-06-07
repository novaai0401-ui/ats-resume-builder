const assert = require('node:assert/strict');
const test = require('node:test');
const { AnalyticsService } = require('../dist/analytics/analytics.service.js');

/**
 * AnalyticsService is the hot path on every /auth request, so the
 * non-blocking + failure-tolerant contract is non-negotiable. These
 * tests pin it without standing up a real HTTP sink:
 *   - no-op when env vars are missing (auth keeps working)
 *   - forwards x-forwarded-for + user-agent to the dashboard so events
 *     get tagged with the end user's IP, not this server's
 *   - never throws when fetch rejects or the sink returns 5xx
 *   - completes synchronously (track() returns void without awaiting)
 */

function withFetch(impl, fn) {
  const originalFetch = global.fetch;
  global.fetch = impl;
  try {
    return fn();
  } finally {
    global.fetch = originalFetch;
  }
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function fakeReq({ xff, ua, lang, remote } = {}) {
  return {
    headers: {
      ...(xff !== undefined ? { 'x-forwarded-for': xff } : {}),
      ...(ua !== undefined ? { 'user-agent': ua } : {}),
      ...(lang !== undefined ? { 'accept-language': lang } : {}),
    },
    socket: { remoteAddress: remote },
  };
}

test('no-ops when AUDIT_URL is missing', () => {
  withEnv({ AUDIT_URL: undefined, AUDIT_WRITE_KEY: 'abc' }, () => {
    let called = 0;
    withFetch(() => { called++; return Promise.resolve(new Response('', { status: 200 })); }, () => {
      new AnalyticsService().track({ type: 'login', email: 'u@x.io' }, fakeReq());
    });
    assert.equal(called, 0);
  });
});

test('no-ops when AUDIT_WRITE_KEY is missing', () => {
  withEnv({ AUDIT_URL: 'https://x.test', AUDIT_WRITE_KEY: undefined }, () => {
    let called = 0;
    withFetch(() => { called++; return Promise.resolve(new Response('', { status: 200 })); }, () => {
      new AnalyticsService().track({ type: 'login', email: 'u@x.io' }, fakeReq());
    });
    assert.equal(called, 0);
  });
});

test('POSTs to {AUDIT_URL}/api/collect with writeKey + event in body', async () => {
  await withEnv({ AUDIT_URL: 'https://sink.test/', AUDIT_WRITE_KEY: 'k_123' }, async () => {
    const calls = [];
    const promise = new Promise((resolve) => {
      withFetch((url, init) => {
        calls.push({ url, init });
        resolve();
        return Promise.resolve(new Response('', { status: 200 }));
      }, () => {
        new AnalyticsService().track(
          { type: 'login', email: 'u@x.io', properties: { method: 'password' } },
          fakeReq({ xff: '203.0.113.5', ua: 'Mozilla/5.0', lang: 'en-IN,en;q=0.9' }),
        );
      });
    });
    await promise;
    assert.equal(calls.length, 1);
    // Trailing slash on AUDIT_URL must not double up.
    assert.equal(calls[0].url, 'https://sink.test/api/collect');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.writeKey, 'k_123');
    assert.equal(body.type, 'login');
    assert.equal(body.email, 'u@x.io');
    assert.equal(body.language, 'en-IN');
    assert.deepEqual(body.properties, { method: 'password' });
  });
});

test('forwards x-forwarded-for and user-agent so dashboard sees end user, not this server', async () => {
  await withEnv({ AUDIT_URL: 'https://sink.test', AUDIT_WRITE_KEY: 'k' }, async () => {
    let captured;
    const promise = new Promise((resolve) => {
      withFetch((_url, init) => {
        captured = init.headers;
        resolve();
        return Promise.resolve(new Response('', { status: 200 }));
      }, () => {
        new AnalyticsService().track(
          { type: 'register' },
          fakeReq({ xff: '198.51.100.7, 10.0.0.1', ua: 'PocketResume/1.2 Android' }),
        );
      });
    });
    await promise;
    // First entry of the XFF chain — the rest are proxies between user and us.
    assert.equal(captured['x-forwarded-for'], '198.51.100.7');
    assert.equal(captured['user-agent'], 'PocketResume/1.2 Android');
  });
});

test('falls back to socket.remoteAddress when x-forwarded-for is absent', async () => {
  await withEnv({ AUDIT_URL: 'https://sink.test', AUDIT_WRITE_KEY: 'k' }, async () => {
    let captured;
    const promise = new Promise((resolve) => {
      withFetch((_url, init) => {
        captured = init.headers;
        resolve();
        return Promise.resolve(new Response('', { status: 200 }));
      }, () => {
        new AnalyticsService().track({ type: 'logout' }, fakeReq({ remote: '192.0.2.10' }));
      });
    });
    await promise;
    assert.equal(captured['x-forwarded-for'], '192.0.2.10');
  });
});

test('does not throw when fetch rejects (auth path must not break)', () => {
  withEnv({ AUDIT_URL: 'https://sink.test', AUDIT_WRITE_KEY: 'k' }, () => {
    withFetch(() => Promise.reject(new Error('ECONNREFUSED')), () => {
      assert.doesNotThrow(() => {
        new AnalyticsService().track({ type: 'login_failed' }, fakeReq());
      });
    });
  });
});

test('does not throw when sink returns 500', () => {
  withEnv({ AUDIT_URL: 'https://sink.test', AUDIT_WRITE_KEY: 'k' }, () => {
    withFetch(() => Promise.resolve(new Response('boom', { status: 500 })), () => {
      assert.doesNotThrow(() => {
        new AnalyticsService().track({ type: 'login' }, fakeReq());
      });
    });
  });
});

test('track() returns void synchronously — does not block the request path', () => {
  withEnv({ AUDIT_URL: 'https://sink.test', AUDIT_WRITE_KEY: 'k' }, () => {
    // fetch that never resolves: if track awaited it, this test would hang.
    withFetch(() => new Promise(() => {}), () => {
      const ret = new AnalyticsService().track({ type: 'login' }, fakeReq());
      assert.equal(ret, undefined);
    });
  });
});
