const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resumeAiFreeDailyLimit,
  enforceResumeAiFreeDaily,
  recordResumeAiFreeUsage,
  resolveResumeAiProvider,
  RESUME_AI_FREE_DAILY_LIMIT_DEFAULT,
} = require('../dist/ai/resume-ai-access.js');

// R-086 — resume-page free-tier daily cap. On the Edit Resume page OUR Groq
// key powers AI for free users, capped to N actions/user/day so free Groq
// data can't be exhausted. These pin: the cap value + env override, the
// throw-at-cap behaviour (C-004), and best-effort recording.

function cfg(map) {
  return { get: (k, d) => (map[k] !== undefined ? map[k] : d) };
}

// Minimal fake Prisma exposing aiCritiqueLog.count / .create plus the
// R-098 aiFeatureTrial ledger. `trialUsed` reports this feature's single
// lifetime free run as already spent; the default (false) keeps these
// tests focused on the R-086 DAY cap, which runs after the trial check.
function fakePrisma({ count = 0, onCreate, trialUsed = false, onTrialUpsert, claimedResumeId = null } = {}) {
  let claim = claimedResumeId ? { resumeId: claimedResumeId, claimedAt: new Date() } : null;
  return {
    calls: { count: 0, create: 0, trialUpsert: 0, claims: 0 },
    // R-103 — the one resume a free user's AI is bound to.
    aiFreeResume: {
      findUnique: async () => claim,
      create: async function ({ data }) { this._p.calls.claims += 1; claim = { resumeId: data.resumeId, claimedAt: new Date() }; return claim; },
    },
    resume: { findFirst: async () => ({ title: 'My first resume' }) },
    aiCritiqueLog: {
      count: async function () { this._p.calls.count += 1; return count; },
      create: async function (args) { this._p.calls.create += 1; if (onCreate) onCreate(args); return {}; },
    },
    aiFeatureTrial: {
      findFirst: async () => (trialUsed ? { id: 'trial-row' } : null),
      findMany: async () => (trialUsed ? [{ feature: 'ats-critique', usedAt: new Date() }] : []),
      upsert: async function (args) { this._p.calls.trialUpsert += 1; if (onTrialUpsert) onTrialUpsert(args); return {}; },
    },
    _wire() { this.aiCritiqueLog._p = this; this.aiFeatureTrial._p = this; this.aiFreeResume._p = this; return this; },
  }._wire();
}

test('default daily limit is 10', () => {
  assert.equal(RESUME_AI_FREE_DAILY_LIMIT_DEFAULT, 10);
  assert.equal(resumeAiFreeDailyLimit(cfg({})), 10);
});

test('daily limit honours AI_FREE_MAX_REQUESTS_PER_DAY override', () => {
  assert.equal(resumeAiFreeDailyLimit(cfg({ AI_FREE_MAX_REQUESTS_PER_DAY: '5' })), 5);
  // Junk / non-positive values fall back to the default (never 0/unlimited).
  assert.equal(resumeAiFreeDailyLimit(cfg({ AI_FREE_MAX_REQUESTS_PER_DAY: 'abc' })), 10);
  assert.equal(resumeAiFreeDailyLimit(cfg({ AI_FREE_MAX_REQUESTS_PER_DAY: '0' })), 10);
});

test('enforce passes when under the cap', async () => {
  const prisma = fakePrisma({ count: 9 });
  await assert.doesNotReject(() => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'ats-critique'));
  assert.equal(prisma.calls.count, 1);
});

test('enforce throws exactly at the cap (10th used → 11th blocked)', async () => {
  const prisma = fakePrisma({ count: 10 });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'ats-critique'),
    /free AI actions for today/,
  );
});

test('enforce respects a lowered cap', async () => {
  const prisma = fakePrisma({ count: 5 });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({ AI_FREE_MAX_REQUESTS_PER_DAY: '5' }), 'u1', 'ats-critique'),
    /5 free AI actions/,
  );
});

test('record writes one log row for the user', async () => {
  let created = null;
  const prisma = fakePrisma({ onCreate: (a) => { created = a; } });
  await recordResumeAiFreeUsage(prisma, 'u42', 'ats-critique');
  assert.equal(prisma.calls.create, 1);
  assert.deepEqual(created, { data: { userId: 'u42' } });
});

test('record never throws even if the DB write fails', async () => {
  const prisma = {
    aiCritiqueLog: { create: async () => { throw new Error('db down'); } },
    aiFeatureTrial: { upsert: async () => { throw new Error('db down'); } },
  };
  await assert.doesNotReject(() => recordResumeAiFreeUsage(prisma, 'u1', 'ats-critique'));
});

// ── Provider routing per user state (the founder's ask) ─────────────────────
// When a user adds their own key → call goes to THEIR key. When they subscribe
// → OUR key (source 'plan'). Free → OUR key, day-capped (source 'free').

function prismaWithPlan(plan) {
  return { user: { findUnique: async () => (plan == null ? null : { plan }) } };
}
// Sentinel "our" server provider; a spy flag proves whether it was built.
function ourBuilder() {
  const our = { name: 'groq', complete: async () => '{}' };
  const fn = () => { fn.called = true; return our; };
  fn.called = false;
  fn.instance = our;
  return fn;
}

test('user WITH their own Groq key → routes to BYOK (never our key)', async () => {
  const build = ourBuilder();
  const res = await resolveResumeAiProvider(
    prismaWithPlan('FREE'), 'u1',
    { provider: 'groq', key: 'gsk_' + 'a'.repeat(40) },
    build,
  );
  assert.equal(res.source, 'byok');
  assert.equal(res.provider.name, 'groq');
  assert.equal(build.called, false, 'BYOK must NOT build our server provider');
});

test('user with their own OpenAI key → routes to BYOK OpenAI', async () => {
  const build = ourBuilder();
  const res = await resolveResumeAiProvider(
    prismaWithPlan('FREE'), 'u1',
    { provider: 'openai', key: 'sk-' + 'a'.repeat(40), model: 'gpt-4o' },
    build,
  );
  assert.equal(res.source, 'byok');
  assert.equal(res.provider.name, 'openai');
  assert.equal(build.called, false);
});

test('subscribed user (PRO), no own key → routes to OUR key (source plan)', async () => {
  const build = ourBuilder();
  const res = await resolveResumeAiProvider(prismaWithPlan('PRO'), 'u1', undefined, build);
  assert.equal(res.source, 'plan');
  assert.equal(res.provider, build.instance);
  assert.equal(build.called, true);
});

test('legacy STUDENT plan also counts as subscribed (our key)', async () => {
  const res = await resolveResumeAiProvider(prismaWithPlan('STUDENT'), 'u1', undefined, ourBuilder());
  assert.equal(res.source, 'plan');
});

test('free user, no own key → OUR key on the day-capped free path', async () => {
  const res = await resolveResumeAiProvider(prismaWithPlan('FREE'), 'u1', undefined, ourBuilder());
  assert.equal(res.source, 'free');
});

test('no server key configured at all → null (caller falls back to rule-based)', async () => {
  const res = await resolveResumeAiProvider(prismaWithPlan('FREE'), 'u1', undefined, () => null);
  assert.equal(res.source, null);
  assert.equal(res.provider, null);
});

test('malformed BYOK header falls through to our key by plan', async () => {
  // Unknown provider name is rejected by the allowlist → not treated as BYOK.
  const res = await resolveResumeAiProvider(
    prismaWithPlan('PRO'), 'u1',
    { provider: 'evil', key: 'whatever' },
    ourBuilder(),
  );
  assert.equal(res.source, 'plan');
});

// ── R-098: the per-feature lifetime trial gates the day cap ────────────────

test('a spent free run is refused before the daily cap is even consulted', async () => {
  const prisma = fakePrisma({ count: 0, trialUsed: true });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'ats-critique'),
    (err) => {
      const body = err.getResponse();
      assert.equal(body.code, 'FREE_TRIAL_FEATURE_USED');
      return true;
    },
  );
  assert.equal(prisma.calls.count, 0, 'the day-bucket query never ran');
});

test('recording a free action burns the feature trial as well as the day bucket', async () => {
  const prisma = fakePrisma({});
  await recordResumeAiFreeUsage(prisma, 'u42', 'jd-match');
  assert.equal(prisma.calls.create, 1, 'day bucket row written');
  assert.equal(prisma.calls.trialUpsert, 1, 'lifetime trial row written');
});

// ── R-103: full AI on ONE resume ──────────────────────────────────────────
//
// Rewriting bullets is how a resume gets BUILT, so metering AI per run left
// users stranded mid-resume. The rule is now: a free user gets every AI
// feature, unlimited, on the first resume they use AI on; a second resume
// asks for the plan.

test('the first resume-bound AI call claims that resume and is allowed', async () => {
  const prisma = fakePrisma({});
  await assert.doesNotReject(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'ats-critique', 'resume-1'),
  );
  assert.equal(prisma.calls.claims, 1, 'the resume is claimed');
});

test('every later AI call on the SAME resume is allowed, unlimited', async () => {
  const prisma = fakePrisma({ claimedResumeId: 'resume-1' });
  for (const feature of ['bullet-rewrite', 'bullet-rewrite', 'ats-critique', 'tech-gap', 'tailor', 'jd-match']) {
    await assert.doesNotReject(
      () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', feature, 'resume-1'),
      `${feature} must stay free on the claimed resume`,
    );
  }
  assert.equal(prisma.calls.claims, 0, 'an existing claim is reused, never re-created');
});

test('the same feature on a DIFFERENT resume asks for the plan', async () => {
  const prisma = fakePrisma({ claimedResumeId: 'resume-1' });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'bullet-rewrite', 'resume-2'),
    (err) => {
      const body = err.getResponse();
      assert.equal(body.code, 'FREE_AI_RESUME_LOCKED');
      assert.equal(body.claimedResumeId, 'resume-1');
      assert.equal(body.claimedResumeTitle, 'My first resume', 'the popup can name the resume');
      assert.match(body.message, /₹499|plan/i);
      assert.match(body.message, /own AI key/i, 'the free own-key route stays visible (C-003)');
      return true;
    },
  );
});

test('a resume-bound call never burns a per-feature free run', async () => {
  const prisma = fakePrisma({ claimedResumeId: 'resume-1' });
  await recordResumeAiFreeUsage(prisma, 'u1', 'ats-critique', 'resume-1');
  assert.equal(prisma.calls.trialUpsert, 0, 'the lifetime trial is untouched for resume work');
  assert.equal(prisma.calls.create, 1, 'only the day-bucket ceiling is counted');
});

test('the resume path uses the higher build ceiling, not the 10/day metered cap', async () => {
  // 12 actions today: over the metered cap (10), under the build ceiling (60).
  const prisma = fakePrisma({ count: 12, claimedResumeId: 'resume-1' });
  await assert.doesNotReject(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1', 'bullet-rewrite', 'resume-1'),
    'a 20-bullet resume must not hit a 10/day wall',
  );
  const exhausted = fakePrisma({ count: 60, claimedResumeId: 'resume-1' });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(exhausted, cfg({}), 'u1', 'bullet-rewrite', 'resume-1'),
    /daily ceiling/i,
  );
});
