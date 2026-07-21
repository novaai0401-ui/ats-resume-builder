'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { ContactsService, CONTACT_RELATIONSHIPS } = require('../dist/contacts/contacts.service.js');

function makePrismaMock() {
  const state = { rows: new Map(), jobs: new Map(), nextId: 0 };
  return {
    state,
    networkContact: {
      async create({ data }) {
        state.nextId += 1;
        const row = {
          id: `contact-${state.nextId}`,
          company: null,
          title: null,
          email: null,
          linkedinUrl: null,
          phone: null,
          jobApplicationId: null,
          notes: null,
          lastContactedAt: null,
          nextFollowUpAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.rows.set(row.id, row);
        return row;
      },
      async findFirst({ where }) {
        for (const row of state.rows.values()) {
          if (row.id === where.id && row.userId === where.userId) return row;
        }
        return null;
      },
      async findMany({ where, orderBy }) {
        let rows = Array.from(state.rows.values()).filter((r) => r.userId === where.userId);
        if (where.nextFollowUpAt) {
          const lte = where.nextFollowUpAt.lte;
          rows = rows.filter(
            (r) => r.nextFollowUpAt != null && r.nextFollowUpAt.getTime() <= lte.getTime(),
          );
        }
        if (orderBy?.nextFollowUpAt === 'asc') {
          rows.sort(
            (a, b) => (a.nextFollowUpAt?.getTime?.() || 0) - (b.nextFollowUpAt?.getTime?.() || 0),
          );
        } else if (orderBy?.[0]?.createdAt === 'desc') {
          rows.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
        }
        return rows;
      },
      async update({ where, data }) {
        const existing = state.rows.get(where.id);
        if (!existing) throw new Error('not found');
        const next = { ...existing, ...data, updatedAt: new Date() };
        state.rows.set(next.id, next);
        return next;
      },
      async delete({ where }) {
        state.rows.delete(where.id);
        return { id: where.id };
      },
      async count({ where }) {
        let n = 0;
        for (const row of state.rows.values()) {
          if (row.userId === where.userId) n += 1;
        }
        return n;
      },
    },
    jobApplication: {
      async findFirst({ where }) {
        for (const job of state.jobs.values()) {
          if (job.id === where.id && job.userId === where.userId) return job;
        }
        return null;
      },
    },
  };
}

describe('ContactsService', () => {
  it('exports the canonical relationship list', () => {
    assert.deepEqual([...CONTACT_RELATIONSHIPS], [
      'recruiter',
      'referrer',
      'colleague',
      'manager',
      'alumni',
      'friend',
      'other',
    ]);
  });

  it('rejects create with an empty name', async () => {
    const svc = new ContactsService(makePrismaMock());
    await assert.rejects(() => svc.create('u1', { name: '   ' }), /name/i);
    await assert.rejects(() => svc.create('u1', { name: '' }), /name/i);
  });

  it('defaults relationship to other and validates unknown values', async () => {
    const svc = new ContactsService(makePrismaMock());
    const noRel = await svc.create('u1', { name: 'Asha' });
    assert.equal(noRel.relationship, 'other');
    const badRel = await svc.create('u1', { name: 'Ben', relationship: 'bff' });
    assert.equal(badRel.relationship, 'other');
    const goodRel = await svc.create('u1', { name: 'Cy', relationship: 'recruiter' });
    assert.equal(goodRel.relationship, 'recruiter');
  });

  it('caps name and notes lengths and coerces empty strings to null', async () => {
    const svc = new ContactsService(makePrismaMock());
    const row = await svc.create('u1', {
      name: 'n'.repeat(500),
      notes: 'x'.repeat(5000),
      company: '   ',
      email: '',
    });
    assert.ok(row.name.length <= 120);
    assert.ok(row.notes.length <= 2000);
    assert.equal(row.company, null);
    assert.equal(row.email, null);
  });

  it('scopes update to the owner (cross-user -> not found)', async () => {
    const svc = new ContactsService(makePrismaMock());
    const c = await svc.create('u1', { name: 'Owner' });
    await assert.rejects(() => svc.update('u2', c.id, { name: 'Hacked' }), /not found/i);
    const ok = await svc.update('u1', c.id, { name: 'Renamed' });
    assert.equal(ok.name, 'Renamed');
  });

  it('scopes delete to the owner (cross-user -> not found)', async () => {
    const svc = new ContactsService(makePrismaMock());
    const c = await svc.create('u1', { name: 'Owner' });
    await assert.rejects(() => svc.remove('u2', c.id), /not found/i);
    const res = await svc.remove('u1', c.id);
    assert.deepEqual(res, { ok: true });
  });

  it('rejects linking a job application owned by another user', async () => {
    const prisma = makePrismaMock();
    prisma.state.jobs.set('job-u2', { id: 'job-u2', userId: 'u2' });
    const svc = new ContactsService(prisma);
    await assert.rejects(
      () => svc.create('u1', { name: 'Asha', jobApplicationId: 'job-u2' }),
      /job application not found/i,
    );
  });

  it('accepts linking a job application owned by the same user', async () => {
    const prisma = makePrismaMock();
    prisma.state.jobs.set('job-u1', { id: 'job-u1', userId: 'u1' });
    const svc = new ContactsService(prisma);
    const c = await svc.create('u1', { name: 'Asha', jobApplicationId: 'job-u1' });
    assert.equal(c.jobApplicationId, 'job-u1');
  });

  it('enforces job ownership on update too', async () => {
    const prisma = makePrismaMock();
    prisma.state.jobs.set('job-u2', { id: 'job-u2', userId: 'u2' });
    const svc = new ContactsService(prisma);
    const c = await svc.create('u1', { name: 'Asha' });
    await assert.rejects(
      () => svc.update('u1', c.id, { jobApplicationId: 'job-u2' }),
      /job application not found/i,
    );
  });

  it('upcoming returns only contacts due within the window, soonest first', async () => {
    const svc = new ContactsService(makePrismaMock());
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    await svc.create('u1', { name: 'NoDate' });
    await svc.create('u1', { name: 'Soon', nextFollowUpAt: new Date(now + 2 * day).toISOString() });
    await svc.create('u1', { name: 'Later', nextFollowUpAt: new Date(now + 30 * day).toISOString() });
    await svc.create('u1', { name: 'Overdue', nextFollowUpAt: new Date(now - day).toISOString() });
    await svc.create('u2', { name: 'Other', nextFollowUpAt: new Date(now + day).toISOString() });

    const due = await svc.upcoming('u1', 7);
    const names = due.map((r) => r.name);
    assert.deepEqual(names, ['Overdue', 'Soon']);
  });
});
