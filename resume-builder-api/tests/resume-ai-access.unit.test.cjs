const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resumeAiFreeDailyLimit,
  enforceResumeAiFreeDaily,
  recordResumeAiFreeUsage,
  RESUME_AI_FREE_DAILY_LIMIT_DEFAULT,
} = require('../dist/ai/resume-ai-access.js');

// R-086 — resume-page free-tier daily cap. On the Edit Resume page OUR Groq
// key powers AI for free users, capped to N actions/user/day so free Groq
// data can't be exhausted. These pin: the cap value + env override, the
// throw-at-cap behaviour (C-004), and best-effort recording.

function cfg(map) {
  return { get: (k, d) => (map[k] !== undefined ? map[k] : d) };
}

// Minimal fake Prisma exposing only aiCritiqueLog.count / .create.
function fakePrisma({ count = 0, onCreate } = {}) {
  return {
    calls: { count: 0, create: 0 },
    aiCritiqueLog: {
      count: async function () { this._p.calls.count += 1; return count; },
      create: async function (args) { this._p.calls.create += 1; if (onCreate) onCreate(args); return {}; },
    },
    _wire() { this.aiCritiqueLog._p = this; return this; },
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
  await assert.doesNotReject(() => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1'));
  assert.equal(prisma.calls.count, 1);
});

test('enforce throws exactly at the cap (10th used → 11th blocked)', async () => {
  const prisma = fakePrisma({ count: 10 });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({}), 'u1'),
    /free AI actions for today/,
  );
});

test('enforce respects a lowered cap', async () => {
  const prisma = fakePrisma({ count: 5 });
  await assert.rejects(
    () => enforceResumeAiFreeDaily(prisma, cfg({ AI_FREE_MAX_REQUESTS_PER_DAY: '5' }), 'u1'),
    /5 free AI actions/,
  );
});

test('record writes one log row for the user', async () => {
  let created = null;
  const prisma = fakePrisma({ onCreate: (a) => { created = a; } });
  await recordResumeAiFreeUsage(prisma, 'u42');
  assert.equal(prisma.calls.create, 1);
  assert.deepEqual(created, { data: { userId: 'u42' } });
});

test('record never throws even if the DB write fails', async () => {
  const prisma = { aiCritiqueLog: { create: async () => { throw new Error('db down'); } } };
  await assert.doesNotReject(() => recordResumeAiFreeUsage(prisma, 'u1'));
});
