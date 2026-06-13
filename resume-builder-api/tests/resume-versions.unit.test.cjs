'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { ResumeVersionsService } = require('../dist/resume/resume-versions.service.js');

function makePrismaMock() {
  const resumes = new Map();
  const versions = [];
  let nextResumeVersionId = 0;
  return {
    resumes,
    versions,
    resume: {
      async findFirst({ where }) {
        for (const r of resumes.values()) {
          if (r.id === where.id && r.userId === where.userId) return r;
        }
        return null;
      },
    },
    resumeVersion: {
      async findFirst({ where }) {
        return (
          versions.find(
            (v) =>
              v.id === where.id &&
              v.resumeId === where.resumeId &&
              v.userId === where.userId,
          ) || null
        );
      },
      async findMany({ where, orderBy, select }) {
        const filtered = versions.filter(
          (v) => v.resumeId === where.resumeId && v.userId === where.userId,
        );
        if (orderBy?.createdAt === 'desc') {
          filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (select) return filtered.map((v) => pick(v, Object.keys(select)));
        return filtered;
      },
      async create({ data, select }) {
        nextResumeVersionId += 1;
        const row = {
          id: `v-${nextResumeVersionId}`,
          createdAt: new Date(Date.now() + nextResumeVersionId),
          ...data,
        };
        versions.push(row);
        return select ? pick(row, Object.keys(select)) : row;
      },
      async delete({ where }) {
        const idx = versions.findIndex((v) => v.id === where.id);
        if (idx >= 0) versions.splice(idx, 1);
        return { id: where.id };
      },
      async deleteMany({ where }) {
        const ids = where.id?.in || [];
        for (let i = versions.length - 1; i >= 0; i--) {
          if (ids.includes(versions[i].id)) versions.splice(i, 1);
        }
        return { count: ids.length };
      },
    },
  };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

function makeResumeServiceMock() {
  return {
    updateCalls: [],
    // Mirrors the real ResumeService method the versions service calls to
    // auto-stamp an ATS score onto each snapshot.
    computeAtsScoreValue() {
      return 73;
    },
    async update(userId, id, dto) {
      this.updateCalls.push({ userId, id, dto });
      return { id, userId, ...dto };
    },
  };
}

function seedResume(prisma, userId, id) {
  prisma.resumes.set(id, {
    id,
    userId,
    title: 'My Resume',
    contact: { fullName: 'A B' },
    summary: 'Summary',
    skills: ['ts', 'react'],
    languages: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    templateId: 'classic',
  });
}

describe('ResumeVersionsService', () => {
  it('snapshot persists the full resume payload + label + score', async () => {
    const prisma = makePrismaMock();
    const resumeSvc = makeResumeServiceMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, resumeSvc);
    const created = await svc.snapshot('u1', 'r1', 'before AI rewrite', 78);
    assert.equal(created.label, 'before AI rewrite');
    assert.equal(created.atsScoreSnapshot, 78);
    assert.equal(prisma.versions.length, 1);
    assert.equal(prisma.versions[0].snapshot.title, 'My Resume');
    assert.deepEqual(prisma.versions[0].snapshot.skills, ['ts', 'react']);
  });

  it('refuses snapshot when resume does not belong to user', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, makeResumeServiceMock());
    await assert.rejects(() => svc.snapshot('attacker', 'r1'), /access/i);
  });

  it('clamps ATS score to 0-100 and slices long labels', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, makeResumeServiceMock());
    const overScore = await svc.snapshot('u1', 'r1', 'x'.repeat(500), 999);
    assert.equal(overScore.atsScoreSnapshot, 100);
    assert.ok(overScore.label.length <= 120);
    const negScore = await svc.snapshot('u1', 'r1', '', -10);
    assert.equal(negScore.atsScoreSnapshot, 0);
    assert.equal(negScore.label, null);
  });

  it('list returns versions newest-first', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, makeResumeServiceMock());
    await svc.snapshot('u1', 'r1', 'first');
    await svc.snapshot('u1', 'r1', 'second');
    await svc.snapshot('u1', 'r1', 'third');
    const list = await svc.list('u1', 'r1');
    assert.equal(list.length, 3);
    assert.equal(list[0].label, 'third');
    assert.equal(list[2].label, 'first');
  });

  it('restore auto-snapshots the current state and calls update on resume', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const resumeSvc = makeResumeServiceMock();
    const svc = new ResumeVersionsService(prisma, resumeSvc);
    const v1 = await svc.snapshot('u1', 'r1', 'baseline');
    // mutate resume in place
    prisma.resumes.get('r1').summary = 'After AI rewrite';
    await svc.restore('u1', 'r1', v1.id);
    // After restore: v1 + auto-snapshot = 2 versions
    assert.equal(prisma.versions.length, 2);
    assert.equal(resumeSvc.updateCalls.length, 1);
    assert.equal(resumeSvc.updateCalls[0].id, 'r1');
    assert.equal(resumeSvc.updateCalls[0].dto.summary, 'Summary');
  });

  it('prunes oldest versions beyond the cap', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, makeResumeServiceMock());
    for (let i = 0; i < 30; i += 1) {
      await svc.snapshot('u1', 'r1', `snap-${i}`);
    }
    assert.ok(prisma.versions.length <= 25, `expected ≤25 versions, got ${prisma.versions.length}`);
  });

  it('refuses to delete a version belonging to another user', async () => {
    const prisma = makePrismaMock();
    seedResume(prisma, 'u1', 'r1');
    const svc = new ResumeVersionsService(prisma, makeResumeServiceMock());
    const v = await svc.snapshot('u1', 'r1', 'mine');
    await assert.rejects(() => svc.remove('attacker', 'r1', v.id), /access|not found/i);
  });
});
