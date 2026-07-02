const assert = require('node:assert/strict');
const test = require('node:test');
const { JobAlertsService } = require('../dist/job-alerts/job-alerts.service.js');

// Saved-search job alerts: create/cap, cron run with URL dedupe, honest
// no-op when Adzuna isn't configured, seenKeys recorded even if SMTP fails.

function makeDeps({ openings = [], configured = true, mailOk = true, alerts = [], activeCount = 0 } = {}) {
  const updates = [];
  const sentEmails = [];
  const prisma = {
    jobAlert: {
      count: async () => activeCount,
      create: async ({ data }) => ({ id: 'a1', ...data, active: true, createdAt: new Date() }),
      findMany: async () => alerts,
      update: async (args) => { updates.push(args); return {}; },
      deleteMany: async ({ where }) => ({ count: where.id === 'a1' ? 1 : 0 }),
    },
    user: {
      findUnique: async () => ({ email: 'u@example.com', fullName: 'Test User' }),
    },
  };
  const liveJobs = {
    isConfigured: () => configured,
    search: async () => openings,
  };
  const mail = {
    sendJobAlertEmail: async (args) => { sentEmails.push(args); return mailOk; },
  };
  return { prisma, liveJobs, mail, updates, sentEmails };
}

const OPENING = (n) => ({
  title: `Role ${n}`, company: `Co ${n}`, location: 'Pune', url: `https://jobs/x/${n}`, salaryText: null, postedAt: null, source: 'adzuna',
});

test('create() validates the query and enforces the per-user cap', async () => {
  const d = makeDeps({ activeCount: 5 });
  const svc = new JobAlertsService(d.prisma, d.liveJobs, d.mail);
  await assert.rejects(() => svc.create('u1', { query: 'react dev' }), /up to 5 active alerts/i);
  const d2 = makeDeps({ activeCount: 0 });
  const svc2 = new JobAlertsService(d2.prisma, d2.liveJobs, d2.mail);
  await assert.rejects(() => svc2.create('u1', { query: ' ' }), /query is required/i);
  const created = await svc2.create('u1', { query: 'react developer', location: 'Pune' });
  assert.equal(created.query, 'react developer');
});

test('runAll() is an honest no-op when the jobs provider is not configured', async () => {
  const d = makeDeps({ configured: false });
  const svc = new JobAlertsService(d.prisma, d.liveJobs, d.mail);
  const res = await svc.runAll();
  assert.deepEqual(res, { ran: 0, emailed: 0, skipped: -1 });
  assert.equal(d.sentEmails.length, 0);
});

test('runAll() emails only UNSEEN openings and records them as seen', async () => {
  const alert = { id: 'a1', userId: 'u1', query: 'react', location: 'Pune', seenKeys: ['https://jobs/x/1'] };
  const d = makeDeps({ openings: [OPENING(1), OPENING(2), OPENING(3)], alerts: [alert] });
  const svc = new JobAlertsService(d.prisma, d.liveJobs, d.mail);
  const res = await svc.runAll();
  assert.equal(res.ran, 1);
  assert.equal(res.emailed, 1);
  assert.equal(d.sentEmails.length, 1);
  const mailArg = d.sentEmails[0];
  assert.equal(mailArg.openings.length, 2, 'seen opening #1 excluded');
  assert.ok(mailArg.openings.every((o) => o.url !== 'https://jobs/x/1'));
  // seenKeys updated to include the new URLs.
  const upd = d.updates.find((u) => u.data.seenKeys);
  assert.ok(upd.data.seenKeys.includes('https://jobs/x/2'));
  assert.ok(upd.data.seenKeys.includes('https://jobs/x/1'), 'old keys retained');
});

test('no email when everything was already seen; lastRunAt still advances', async () => {
  const alert = { id: 'a1', userId: 'u1', query: 'react', location: null, seenKeys: ['https://jobs/x/1'] };
  const d = makeDeps({ openings: [OPENING(1)], alerts: [alert] });
  const svc = new JobAlertsService(d.prisma, d.liveJobs, d.mail);
  const res = await svc.runAll();
  assert.equal(res.emailed, 0);
  assert.equal(d.sentEmails.length, 0);
  assert.ok(d.updates.some((u) => u.data.lastRunAt), 'lastRunAt updated');
});

test('seenKeys are recorded even when SMTP fails (no infinite re-queue)', async () => {
  const alert = { id: 'a1', userId: 'u1', query: 'react', location: null, seenKeys: [] };
  const d = makeDeps({ openings: [OPENING(9)], alerts: [alert], mailOk: false });
  const svc = new JobAlertsService(d.prisma, d.liveJobs, d.mail);
  const res = await svc.runAll();
  assert.equal(res.emailed, 0, 'send reported false');
  const upd = d.updates.find((u) => u.data.seenKeys);
  assert.ok(upd.data.seenKeys.includes('https://jobs/x/9'));
});
