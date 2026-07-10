const assert = require('node:assert/strict');
const test = require('node:test');
const { ResumeService } = require('../dist/resume/resume.service.js');
const { SettingsService } = require('../dist/settings/settings.service.js');

/**
 * Pins the monthly-export quota contract.
 *
 * Bug we are guarding against (reported by the founder pre-launch):
 *   A FREE user pulled more than 5 PDF downloads in a single month
 *   even though the billing page promises "5 PDF exports / month".
 *   Root cause: the quota check was gated behind
 *   PRODUCT_FLOW_RESTRICTIONS_ENABLED, which defaults to false in
 *   production, so the check never fired.
 *
 * New contract:
 *   - PDF and DOCX share the same pdfExportsUsed / pdfExportsLimit
 *     counter (billing page bills them as a single "PDF + Word
 *     exports / month" line).
 *   - The counter is ENFORCED UNCONDITIONALLY — no env flag, no
 *     plan carve-out. If used + 1 > limit, ForbiddenException.
 *   - Increment happens AFTER the render succeeds so a Chrome / DOCX
 *     render failure doesn't burn one of the user's allotted exports.
 */

function makeState(overrides = {}) {
  const userBase = {
    id: 'user-1',
    plan: 'FREE',
    atsScansUsed: 0,
    atsScansLimit: 2,
    pdfExportsUsed: 5,
    premiumCredits: 0,
    pdfExportsLimit: 5,
    resumesLimit: 5,
    aiTokensUsed: 0,
    aiTokensLimit: 8000,
    usagePeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    usagePeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
    stripeCurrentPeriodEnd: null,
  };
  return {
    user: { ...userBase, ...overrides },
    resume: {
      id: 'resume-1',
      userId: 'user-1',
      title: 'Quota Test Resume',
      contact: { fullName: 'Free User', email: 'u@x.io' },
      summary: 'Software engineer with five years of building distributed systems.',
      skills: ['Node.js', 'TypeScript', 'Postgres'],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
      achievements: [],
      sections: [],
      templateId: 'classic',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    appSetting: {
      id: 'app-settings',
      rateLimitEnabled: false,
      paymentFeatureEnabled: false,
    },
  };
}

function createInMemoryPrisma(overrides = {}) {
  const state = makeState(overrides);
  return {
    user: {
      findUnique: async ({ where }) =>
        where.id === state.user.id ? { ...state.user } : null,
      update: async ({ where, data }) => {
        if (where.id !== state.user.id) return null;
        // Resolve Prisma atomic operators ({increment}/{decrement}) the
        // way the real client would — the R-037 credit path uses
        // `premiumCredits: { decrement: 1 }`.
        const resolved = {};
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in value) {
            resolved[key] = (state.user[key] || 0) + value.increment;
          } else if (value && typeof value === 'object' && 'decrement' in value) {
            resolved[key] = (state.user[key] || 0) - value.decrement;
          } else {
            resolved[key] = value;
          }
        }
        state.user = { ...state.user, ...resolved };
        return { ...state.user };
      },
    },
    resume: {
      findFirst: async ({ where }) =>
        where.id === state.resume.id && where.userId === state.user.id
          ? { ...state.resume }
          : null,
      findUnique: async ({ where }) =>
        where.id === state.resume.id ? { ...state.resume } : null,
    },
    appSetting: {
      findUnique: async ({ where }) =>
        where.id === state.appSetting.id ? { ...state.appSetting } : null,
      upsert: async ({ create }) => {
        state.appSetting = {
          id: create.id,
          rateLimitEnabled: create.rateLimitEnabled,
          paymentFeatureEnabled: create.paymentFeatureEnabled ?? false,
        };
        return { ...state.appSetting };
      },
    },
    __getState: () => state,
  };
}

async function buildService(prisma) {
  const settings = new SettingsService(prisma);
  await settings.ensureDefaults();
  return new ResumeService(prisma, settings);
}

test('generatePdf rejects when pdfExportsUsed has reached pdfExportsLimit', async () => {
  // FREE user, 5/5 used. Sixth attempt MUST throw — this is the
  // contract the billing page advertises.
  const prisma = createInMemoryPrisma({ pdfExportsUsed: 5, pdfExportsLimit: 5 });
  const service = await buildService(prisma);

  await assert.rejects(
    () => service.generatePdf('user-1', 'resume-1'),
    (err) => {
      assert.match(
        String(err && err.message),
        /Monthly export limit reached/,
        'must surface a clear quota message, not a generic 500',
      );
      return true;
    },
  );
  // Counter must NOT be incremented when the request is rejected —
  // otherwise repeated bounces would silently shift the user further
  // into the red.
  assert.equal(prisma.__getState().user.pdfExportsUsed, 5);
});

test('generateDocx rejects when pdfExportsUsed has reached pdfExportsLimit', async () => {
  // DOCX shares the export quota. Previously this method had NO quota
  // check at all — paid + free users could pull unlimited .docx files
  // even after exhausting the limit. Regression guard.
  const prisma = createInMemoryPrisma({ pdfExportsUsed: 5, pdfExportsLimit: 5 });
  const service = await buildService(prisma);

  await assert.rejects(
    () => service.generateDocx('user-1', 'resume-1'),
    (err) => {
      assert.match(String(err && err.message), /Monthly export limit reached/);
      return true;
    },
  );
  assert.equal(prisma.__getState().user.pdfExportsUsed, 5);
});

test('quota enforcement applies to STUDENT and PRO too, not just FREE', async () => {
  // The earlier flag-gated path would have skipped paid plans entirely.
  // The contract is universal: every plan has a documented monthly
  // export ceiling and we enforce it for everyone.
  for (const plan of ['STUDENT', 'PRO']) {
    const prisma = createInMemoryPrisma({
      plan,
      pdfExportsUsed: 25,
      pdfExportsLimit: 25,
    });
    const service = await buildService(prisma);
    await assert.rejects(() => service.generateDocx('user-1', 'resume-1'), (err) => {
      assert.match(String(err && err.message), /Monthly export limit reached/);
      return true;
    });
  }
});

test('generateDocx with quota remaining: increments the counter on success', async () => {
  // The render path itself runs in this test (docx is a pure
  // in-memory build, no Chrome needed). One successful export should
  // bump the counter by exactly one.
  const prisma = createInMemoryPrisma({ pdfExportsUsed: 2, pdfExportsLimit: 5 });
  const service = await buildService(prisma);

  const buf = await service.generateDocx('user-1', 'resume-1');
  assert.ok(Buffer.isBuffer(buf), 'expected a docx buffer');
  assert.ok(buf.length > 0, 'expected a non-empty docx buffer');
  assert.equal(
    prisma.__getState().user.pdfExportsUsed,
    3,
    'counter must increment by 1 on a successful render',
  );
});

// ── R-037: referral credits buy exports past the cap ────────────────

test('generateDocx at the cap consumes a referral credit instead of 403', async () => {
  const prisma = createInMemoryPrisma({
    pdfExportsUsed: 5,
    pdfExportsLimit: 5,
    premiumCredits: 2,
  });
  const service = await buildService(prisma);

  const buf = await service.generateDocx('user-1', 'resume-1');
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0, 'expected a docx buffer');
  const user = prisma.__getState().user;
  assert.equal(user.premiumCredits, 1, 'one credit consumed');
  assert.equal(user.pdfExportsUsed, 5, 'monthly counter NOT incremented on the credit path');
});

test('generateDocx at the cap with 0 credits still rejects, and mentions referral', async () => {
  const prisma = createInMemoryPrisma({
    pdfExportsUsed: 5,
    pdfExportsLimit: 5,
    premiumCredits: 0,
  });
  const service = await buildService(prisma);

  await assert.rejects(() => service.generateDocx('user-1', 'resume-1'), (err) => {
    assert.match(String(err && err.message), /Monthly export limit reached/);
    assert.match(String(err && err.message), /refer a friend/i, 'error must surface the referral path');
    return true;
  });
  assert.equal(prisma.__getState().user.premiumCredits, 0);
});

test('credits are NOT consumed while the user is under the monthly cap', async () => {
  const prisma = createInMemoryPrisma({
    pdfExportsUsed: 2,
    pdfExportsLimit: 5,
    premiumCredits: 3,
  });
  const service = await buildService(prisma);

  await service.generateDocx('user-1', 'resume-1');
  const user = prisma.__getState().user;
  assert.equal(user.pdfExportsUsed, 3, 'counter increments normally under the cap');
  assert.equal(user.premiumCredits, 3, 'credits untouched while quota remains');
});

// ── B1 regression: a FAILED PDF render must not burn a paid export ──────
//
// generatePdf previously incremented pdfExportsUsed BEFORE launching Chrome,
// so a launch/render failure charged the user an export and returned nothing.
// The renderer now runs first (renderHtmlToPdf), and the charge happens only
// after it resolves. We force a deterministic render failure by pointing
// Chrome at a fake, non-browser executable and assert the counter is
// untouched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function withEnvAsync(env, fn) {
  const prev = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test('B1: a failed PDF render does NOT charge the user an export', async () => {
  const fakeChrome = path.join(os.tmpdir(), `fake-chrome-${process.pid}`);
  fs.writeFileSync(fakeChrome, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(fakeChrome, 0o755);
  try {
    await withEnvAsync(
      {
        ENABLE_DOWNLOAD_CHARGE: undefined,
        ENFORCE_EXPORT_QUOTA: 'true',
        AWS_LAMBDA_FUNCTION_NAME: undefined,
        CHROME_EXECUTABLE_PATH: fakeChrome,
        PUPPETEER_EXECUTABLE_PATH: fakeChrome,
      },
      async () => {
        const prisma = createInMemoryPrisma({ pdfExportsUsed: 2, pdfExportsLimit: 5 });
        const service = await buildService(prisma);
        await assert.rejects(() => service.generatePdf('user-1', 'resume-1'));
        // The whole point: the render failed, so the counter must be UNCHANGED.
        assert.equal(
          prisma.__getState().user.pdfExportsUsed,
          2,
          'a failed render must not consume a paid export',
        );
      },
    );
  } finally {
    fs.rmSync(fakeChrome, { force: true });
  }
});

test('pdfRendererStats exposes concurrency config', () => {
  const { pdfRendererStats } = require('../dist/resume/pdf-renderer.js');
  const s = pdfRendererStats();
  assert.equal(typeof s.active, 'number');
  assert.equal(typeof s.queued, 'number');
  assert.ok(s.maxConcurrency >= 1);
});
