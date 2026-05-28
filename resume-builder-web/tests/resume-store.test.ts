import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ResumeStore, ResumeOwnerMismatchError } from '../src/lib/resume-store/index';
import { MemoryBackend } from '../src/lib/resume-store/memory-backend';
import type { Resume } from 'resume-builder-shared';

function fixtureResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'rsm_1',
    userId: 'user_a',
    title: 'Engineer resume',
    summary: 'A summary.',
    skills: ['React', 'TypeScript'],
    experience: [],
    education: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Resume;
}

function freshStore(): ResumeStore {
  return new ResumeStore(new MemoryBackend());
}

test('saveResume stamps updatedAt and round-trips through getResume', async () => {
  const store = freshStore();
  const before = fixtureResume({ updatedAt: '2020-01-01T00:00:00.000Z' });
  const saved = await store.saveResume(before);
  assert.notEqual(saved.updatedAt, before.updatedAt);
  const read = await store.getResume('rsm_1');
  assert.equal(read?.title, 'Engineer resume');
});

test('listResumes returns most-recently-updated first', async () => {
  const store = freshStore();
  await store.saveResume(fixtureResume({ id: 'a', title: 'A' }));
  await new Promise((r) => setTimeout(r, 5));
  await store.saveResume(fixtureResume({ id: 'b', title: 'B' }));
  const list = await store.listResumes();
  assert.equal(list[0].id, 'b');
  assert.equal(list[1].id, 'a');
});

test('deleteResume cascades to its version snapshots', async () => {
  const store = freshStore();
  await store.saveResume(fixtureResume({ id: 'r' }));
  await store.snapshotVersion('r', 'v1');
  await store.snapshotVersion('r', 'v2');
  let versions = await store.listVersions('r');
  assert.equal(versions.length, 2);
  await store.deleteResume('r');
  versions = await store.listVersions('r');
  assert.equal(versions.length, 0);
  const read = await store.getResume('r');
  assert.equal(read, null);
});

test('snapshot + restore round-trips with edits in between', async () => {
  const store = freshStore();
  await store.saveResume(fixtureResume({ id: 'r', title: 'Original' }));
  const snap = await store.snapshotVersion('r', 'pre-rewrite');
  await store.saveResume(fixtureResume({ id: 'r', title: 'Rewritten' }));
  const restored = await store.restoreVersion(snap.id);
  assert.equal(restored.title, 'Original');
  const read = await store.getResume('r');
  assert.equal(read?.title, 'Original');
});

test('assertOwner blocks cross-account access in same browser', async () => {
  const store = freshStore();
  await store.assertOwner('user_a');
  await store.assertOwner('user_a'); // idempotent
  await assert.rejects(
    () => store.assertOwner('user_b'),
    (err: unknown) => err instanceof ResumeOwnerMismatchError,
  );
});

test('wipe clears resumes, versions, and ownership', async () => {
  const store = freshStore();
  await store.assertOwner('user_a');
  await store.saveResume(fixtureResume({ id: 'r' }));
  await store.snapshotVersion('r', 'v1');
  await store.wipe();
  assert.equal((await store.listResumes()).length, 0);
  assert.equal((await store.listVersions('r')).length, 0);
  // After wipe, a different user can take ownership.
  await store.assertOwner('user_b');
});

test('exportAll / importAll round-trips resumes and versions', async () => {
  const a = freshStore();
  await a.saveResume(fixtureResume({ id: 'r1', title: 'One' }));
  await a.saveResume(fixtureResume({ id: 'r2', title: 'Two' }));
  await a.snapshotVersion('r1', 'snap-r1');
  const bundle = await a.exportAll();
  assert.equal(bundle.resumes.length, 2);
  assert.equal(bundle.versions.length, 1);

  const b = freshStore();
  await b.importAll(bundle);
  assert.equal((await b.listResumes()).length, 2);
  const versions = await b.listVersions('r1');
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, 'snap-r1');
});

test('importAll rejects bundles with unsupported schemaVersion', async () => {
  const store = freshStore();
  await assert.rejects(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.importAll({ schemaVersion: 99, exportedAt: 'x', resumes: [], versions: [] } as any),
  );
});

test('saveResume bumps internal version on each write', async () => {
  const store = freshStore();
  const backend = new MemoryBackend();
  const s = new ResumeStore(backend);
  await s.saveResume(fixtureResume({ id: 'r' }));
  await s.saveResume(fixtureResume({ id: 'r', title: 'updated' }));
  // Peek into the backend — version should be 2.
  const rec = await backend.get('resumes', 'r');
  assert.equal(rec?.version, 2);
});
