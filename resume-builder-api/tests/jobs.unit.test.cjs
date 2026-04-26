'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { JobsService, JOB_STATUSES } = require('../dist/jobs/jobs.service.js');

function makePrismaMock() {
  const state = { rows: new Map(), nextId: 0 };
  return {
    state,
    jobApplication: {
      async create({ data }) {
        state.nextId += 1;
        const row = {
          id: `job-${state.nextId}`,
          appliedAt: null,
          closedAt: null,
          nextActionAt: null,
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
        const rows = Array.from(state.rows.values()).filter(
          (r) => r.userId === where.userId && (!where.status || r.status === where.status),
        );
        if (orderBy?.[0]?.updatedAt === 'desc') {
          rows.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
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
      async groupBy({ where }) {
        const counts = new Map();
        for (const row of state.rows.values()) {
          if (row.userId !== where.userId) continue;
          counts.set(row.status, (counts.get(row.status) || 0) + 1);
        }
        return Array.from(counts.entries()).map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      },
    },
  };
}

describe('JobsService', () => {
  it('exports the canonical status list', () => {
    assert.deepEqual([...JOB_STATUSES], [
      'wishlist',
      'applied',
      'phone_screen',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
    ]);
  });

  it('creates a job with defaults when no status provided', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    const job = await svc.create('u1', { company: 'Acme', role: 'Engineer' });
    assert.equal(job.company, 'Acme');
    assert.equal(job.role, 'Engineer');
    assert.equal(job.status, 'wishlist');
    assert.equal(job.userId, 'u1');
  });

  it('rejects missing company or role', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    await assert.rejects(() => svc.create('u1', { company: '', role: 'Eng' }), /company/i);
    await assert.rejects(() => svc.create('u1', { company: 'Acme', role: '  ' }), /role/i);
  });

  it('rejects unknown status values by coercing to wishlist', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    const job = await svc.create('u1', {
      company: 'Acme',
      role: 'Engineer',
      // @ts-expect-error testing runtime coercion
      status: 'random',
    });
    assert.equal(job.status, 'wishlist');
  });

  it('auto-stamps appliedAt when moving to applied', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    const job = await svc.create('u1', { company: 'Acme', role: 'Eng' });
    const updated = await svc.update('u1', job.id, { company: 'Acme', role: 'Eng', status: 'applied' });
    assert.ok(updated.appliedAt, 'appliedAt should be set');
    assert.equal(updated.status, 'applied');
  });

  it('auto-stamps closedAt when moving to a terminal state', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    const job = await svc.create('u1', { company: 'Acme', role: 'Eng' });
    const updated = await svc.update('u1', job.id, { company: 'Acme', role: 'Eng', status: 'rejected' });
    assert.ok(updated.closedAt);
    assert.equal(updated.status, 'rejected');
  });

  it('scopes queries to the owning userId', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    await svc.create('u1', { company: 'A', role: 'R' });
    await svc.create('u2', { company: 'B', role: 'R' });
    const rows = await svc.list('u1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].company, 'A');
  });

  it('computes pipeline stats including response and offer rate', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    await svc.create('u1', { company: 'A', role: 'R', status: 'applied' });
    await svc.create('u1', { company: 'B', role: 'R', status: 'applied' });
    await svc.create('u1', { company: 'C', role: 'R', status: 'interview' });
    await svc.create('u1', { company: 'D', role: 'R', status: 'offer' });
    await svc.create('u1', { company: 'E', role: 'R', status: 'rejected' });
    const stats = await svc.stats('u1');
    assert.equal(stats.total, 5);
    assert.equal(stats.byStatus.applied, 2);
    assert.equal(stats.byStatus.offer, 1);
    assert.equal(stats.byStatus.rejected, 1);
    // response denominator = applied + phone_screen + interview + offer + rejected = 5
    // responding = phone_screen + interview + offer = 2
    assert.equal(stats.responseRate, 0.4);
    // offer rate = offer / (offer + rejected) = 1 / 2
    assert.equal(stats.offerRate, 0.5);
  });

  it('clamps absurdly long notes and JD text', async () => {
    const prisma = makePrismaMock();
    const svc = new JobsService(prisma);
    const longNotes = 'x'.repeat(20_000);
    const longJd = 'y'.repeat(50_000);
    const job = await svc.create('u1', {
      company: 'A',
      role: 'R',
      notes: longNotes,
      jdText: longJd,
    });
    assert.ok(job.notes.length <= 5000);
    assert.ok(job.jdText.length <= 20000);
  });
});
