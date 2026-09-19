import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer, newNumbers } from '../dist/server.js';
import { PocketResumeClient } from '../dist/api-client.js';

/**
 * R-108 regression.
 *
 * Two defects, one consequence. `get_download_link` took only a resumeId
 * and always linked to the LIVE resume, while `tailor_resume` saved its
 * output as a non-live version — so the advertised flow (tailor → log the
 * version → download) handed the user the original while attributing the
 * outcome to the tailored variant. And `tailor_resume` applied every AI
 * suggestion with no human in between, so an invented metric landed in
 * the document the user sends to employers under their own name.
 */

async function connect(apiStub = {}) {
  const client = Object.assign(
    new PocketResumeClient({ baseUrl: 'https://example.invalid', token: 't' }),
    apiStub,
  );
  const server = buildServer(client);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(st), mcp.connect(ct)]);
  return mcp;
}

const payload = (res) => JSON.parse(res.content[0].text);

const PROPOSAL = {
  summary: { before: 'Engineer with payments experience.', after: 'Engineer who cut latency 40%.' },
  bullets: [
    { experienceIndex: 0, bulletIndex: 0, before: 'Built the ledger service', after: 'Built the ledger service handling 2M daily transactions' },
    { experienceIndex: 0, bulletIndex: 1, before: 'Mentored juniors', after: 'Mentored three junior engineers' },
  ],
  skillsToAdd: ['Kubernetes', 'Go'],
};

test('the download link carries the tailored version, not just the resume', async () => {
  const mcp = await connect({ downloadChargeConfig: async () => ({ enabled: false }) });
  const res = await mcp.callTool({
    name: 'get_download_link',
    arguments: { resumeId: 'r1', versionId: 'v-tailored' },
  });
  await mcp.close();

  const url = new URL(payload(res).url);
  assert.equal(url.searchParams.get('resumeId'), 'r1');
  assert.equal(url.searchParams.get('versionId'), 'v-tailored', 'the exact version must survive into the link');
  assert.match(payload(res).downloading, /tailored/);
});

test('without a versionId the link still resolves to the live resume', async () => {
  const mcp = await connect({ downloadChargeConfig: async () => ({ enabled: false }) });
  const res = await mcp.callTool({ name: 'get_download_link', arguments: { resumeId: 'r1' } });
  await mcp.close();

  const url = new URL(payload(res).url);
  assert.equal(url.searchParams.get('versionId'), null);
  assert.match(payload(res).downloading, /live/);
});

test('get_resume_version returns the version content for review', async () => {
  const mcp = await connect({
    getVersion: async (resumeId, versionId) => ({
      id: versionId,
      label: 'Tailored: Staff Engineer @ Acme',
      atsScoreSnapshot: 82,
      createdAt: '2026-09-01T00:00:00Z',
      snapshot: { title: 'Staff Engineer Resume', summary: 'Tailored summary' },
    }),
  });
  const res = await mcp.callTool({ name: 'get_resume_version', arguments: { resumeId: 'r1', versionId: 'v1' } });
  await mcp.close();

  const out = payload(res);
  assert.equal(out.versionId, 'v1');
  assert.equal(out.resume.summary, 'Tailored summary', 'the snapshot content must reach the assistant');
});

test('proposing does not save anything', async () => {
  let applied = false;
  const mcp = await connect({
    tailorPropose: async () => PROPOSAL,
    getResume: async () => ({ skills: ['Python'] }),
    tailorApply: async () => {
      applied = true;
      return { version: { id: 'v1', label: 'x', createdAt: '' }, appliedBullets: 0, rejectedAsStale: 0 };
    },
  });
  const res = await mcp.callTool({ name: 'propose_tailoring', arguments: { resumeId: 'r1', jdText: 'x'.repeat(100) } });
  await mcp.close();

  assert.equal(applied, false, 'propose must never write — that was the whole defect');
  assert.equal(payload(res).bullets.length, 2);
});

test('proposals flag invented numbers and unearned skills for confirmation', async () => {
  const mcp = await connect({
    tailorPropose: async () => PROPOSAL,
    getResume: async () => ({ skills: ['Go'] }), // Go is already held; Kubernetes is not
  });
  const res = await mcp.callTool({ name: 'propose_tailoring', arguments: { resumeId: 'r1', jdText: 'x'.repeat(100) } });
  await mcp.close();

  const flags = payload(res).needsConfirmation;
  const ids = flags.map((f) => f.id);
  assert.ok(ids.includes('summary'), '40% appears in the rewrite but not the original');
  assert.ok(ids.includes('bullet:0'), '2M daily transactions is a new claim');
  assert.ok(ids.includes('skill:Kubernetes'), 'a skill the user does not list needs confirming');
  assert.ok(!ids.includes('skill:Go'), 'a skill already on the resume is not a new claim');
});

test('apply_tailoring saves ONLY what the user approved', async () => {
  let sent = null;
  const mcp = await connect({
    tailorApply: async (_id, input) => {
      sent = input;
      return { version: { id: 'v9', label: 'Tailored: Acme', createdAt: '' }, appliedBullets: 1, rejectedAsStale: 0 };
    },
  });
  const res = await mcp.callTool({
    name: 'apply_tailoring',
    arguments: {
      resumeId: 'r1',
      proposal: PROPOSAL,
      // The user approved one bullet and neither skill, and rejected the summary.
      accept: { summary: false, bulletIds: [1], skills: [] },
      company: 'Acme',
    },
  });
  await mcp.close();

  assert.equal(sent.summary, null, 'a rejected summary is not saved');
  assert.equal(sent.bullets.length, 1);
  assert.equal(sent.bullets[0].bulletIndex, 1, 'only the approved bullet');
  assert.deepEqual(sent.skillsToAdd, [], 'unconfirmed skills are not added');
  assert.equal(sent.applyToLive, false, 'the live resume is never modified');
  assert.equal(payload(res).versionId, 'v9');
});

test('apply_tailoring cannot add a skill that was never proposed', async () => {
  let sent = null;
  const mcp = await connect({
    tailorApply: async (_id, input) => {
      sent = input;
      return { version: { id: 'v9', label: null, createdAt: '' }, appliedBullets: 0, rejectedAsStale: 0 };
    },
  });
  await mcp.callTool({
    name: 'apply_tailoring',
    arguments: {
      resumeId: 'r1',
      proposal: PROPOSAL,
      accept: { bulletIds: [0], skills: ['Kubernetes', 'Rust'] },
    },
  });
  await mcp.close();

  assert.deepEqual(sent.skillsToAdd, ['Kubernetes'], 'Rust was never proposed, so it is not ours to add');
});

test('approving nothing writes nothing', async () => {
  let called = false;
  const mcp = await connect({
    tailorApply: async () => {
      called = true;
      return { version: { id: 'v', label: null, createdAt: '' }, appliedBullets: 0, rejectedAsStale: 0 };
    },
  });
  const res = await mcp.callTool({
    name: 'apply_tailoring',
    arguments: { resumeId: 'r1', proposal: PROPOSAL, accept: {} },
  });
  await mcp.close();

  assert.equal(called, false, 'an empty approval must not create a version');
  assert.equal(payload(res).applied, false);
});

test('newNumbers spots added figures without flagging rewording', () => {
  assert.deepEqual(newNumbers('Led the team', 'Led a team of 12'), ['12']);
  assert.deepEqual(newNumbers('Cut latency by 40%', 'Reduced latency 40%'), [], 'same figure, reworded');
  assert.deepEqual(newNumbers('Shipped features', 'Shipped 3 features in 2 quarters').sort(), ['2', '3']);
  assert.deepEqual(newNumbers('', ''), []);
});
